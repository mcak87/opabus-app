// Planer trasy – wybór opcji (zasady z CLAUDE.md „Planer trasy – kilka sposobów dotarcia”):
// przystanki w zasięgu 800 m (w razie potrzeby 1,5 km), okno ok. 90 min, 3–5 naprawdę różnych opcji z etykietami,
// porównanie z najbliższym przystankiem i ostatni powrót dziś. Czysty TypeScript (testy: scripts/test-planner.ts).
import type { Calendar } from '../data/queries.ts';
import { distanceM, type LatLon } from '../lib/geo.ts';
import { addDays, type ServiceDay } from '../lib/time.ts';

import { dayTrips, departureTimes, raptor, stopsNear, walkSec, type DayTrips, type Journey, type Net, type RideLeg } from './raptor.ts';

export type Label = 'earliest' | 'fastest' | 'direct' | 'lessWalk' | 'cheapest';
export type Option = Journey & { labels: Label[] };
export type Comparison = {
  /** Przystanek najlepszej opcji (stacja) i ile dalej od najbliższego [m]. */
  station: number;
  fartherM: number;
  direct: boolean;
  fasterMin: number;
};
export type PlanResult = {
  options: Option[];
  /** Dzień, którego dotyczą godziny (dziś, a gdy dziś już nic nie jedzie – najbliższy dzień z połączeniem). */
  day: ServiceDay;
  /** Ile dni po dniu zapytania (0 = ten sam dzień). Promy kursują czasem tylko w wybrane dni tygodnia. */
  daysAhead: number;
  tomorrow: boolean;
  radius: number;
  comparison: Comparison | null;
  lastBack: Journey | null;
  /** Gdy cel jest blisko – ile minut pieszo (bez autobusu). */
  walkOnlyMin: number | null;
};

const WINDOWS = [90 * 60, 4 * 3600, 20 * 3600];
const RADII = [800, 1500];
/**
 * Najwyżej tyle przebiegów RAPTOR na okno. W dużym mieście odjazd jest co minutę (Ateny: 91 godzin w 90 min,
 * ok. 20 ms na przebieg) – bierzemy równo rozłożone godziny, opcje i tak wychodzą różne.
 */
const MAX_RUNS = 24;
const MAX_OPTIONS = 5;
const WALK_ONLY_SEC = 8 * 60;
/** Gdy dziś nic – szukamy najbliższego dnia z połączeniem (promy bywają raz–dwa razy w tygodniu). */
const MAX_DAYS_AHEAD = 7;
/** Najwyżej 2 przesiadki (zasady planera z CLAUDE.md). */
const MAX_RIDES = 3;
const EARLY_SLACK = 30 * 60;
/** Tyle czekania w podróży to już „za wcześnie wychodzisz” – szukamy też późniejszego wyjścia. */
const LONG_WAIT = 60 * 60;

// Wzorzec + kurs + odjazd: w sieci z kilku paczek numery kursów się powtarzają, a ten sam kurs bywa wczoraj i dziś.
const signature = (j: Journey) =>
  j.legs
    .filter((l): l is RideLeg => l.kind === 'ride')
    .map((l) => `${l.pattern}:${l.trip}:${l.dep}`)
    .join('>');
const firstRide = (j: Journey) => j.legs.find((l): l is RideLeg => l.kind === 'ride') ?? null;

/** Najwyżej `max` elementów równo rozłożonych (z pierwszym i ostatnim). */
function spread<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.round((i * (list.length - 1)) / (max - 1))]);
}

/**
 * Wszystkie podróże z odjazdami w oknie [from, to] (RAPTOR dla kolejnych odjazdów). Od najpóźniejszego odjazdu:
 * przyjazd znaleziony dla późniejszego wyjścia jest górną granicą dla wcześniejszych (można poczekać), więc kolejne
 * przebiegi szukają tylko tego, co coś poprawia.
 */
function collect(net: Net, trips: DayTrips, access: Map<number, number>, egress: Map<number, number>, from: number, to: number): Journey[] {
  const times = spread(departureTimes(net, trips, access, from, to), MAX_RUNS).reverse();
  const bounds = new Float64Array(MAX_RIDES + 1).fill(Infinity);
  const out: Journey[] = [];
  for (const t of times) {
    for (const j of raptor(net, trips, access, egress, t, MAX_RIDES, bounds)) {
      out.push(j);
      for (let k = j.rides; k <= MAX_RIDES; k++) bounds[k] = Math.min(bounds[k], j.arrive);
    }
  }
  return out;
}

/** Jedna podróż na zestaw kursów: najpóźniejsze wyjście, potem najmniej chodzenia. */
function dedupe(list: Journey[]): Journey[] {
  const by = new Map<string, Journey>();
  for (const j of list) {
    const key = signature(j);
    const cur = by.get(key);
    if (!cur || j.leave > cur.leave || (j.leave === cur.leave && j.walk < cur.walk)) by.set(key, j);
  }
  return [...by.values()];
}

/**
 * Zostają tylko podróże, których żadna inna nie bije we wszystkim (wyjście, przyjazd, przejazdy, chodzenie).
 * Wyjście co najmniej 30 min wcześniej na ten sam przyjazd też odpada, nawet gdy ma kilka minut mniej chodzenia.
 */
function pareto(list: Journey[]): Journey[] {
  return list.filter(
    (j) =>
      !list.some(
        (i) =>
          i !== j &&
          i.leave >= j.leave &&
          i.arrive <= j.arrive &&
          i.rides <= j.rides &&
          ((i.walk <= j.walk && (i.leave > j.leave || i.arrive < j.arrive || i.rides < j.rides || i.walk < j.walk)) ||
            (i.leave >= j.leave + EARLY_SLACK && i.walk <= j.walk + 10 * 60)),
      ),
  );
}

/** Czekanie w podróży: czas, w którym nie jedziemy, nie idziemy i nie czekamy na wejście na prom. */
function idleSec(net: Net, j: Journey): number {
  let busy = j.walk;
  for (const l of j.legs) if (l.kind === 'ride') busy += l.arr - l.dep + net.patterns[l.pattern].boardSec;
  return j.arrive - j.leave - busy;
}

/**
 * Najwcześniejszy przyjazd wymaga długiego czekania (np. pociąg IC dopiero po południu, prom wieczorem): wyjścia z okna
 * łapią ten sam kurs dużo za wcześnie. Szukamy więc też wyjść tuż przed nim – w pareto() wygrają z tymi za wcześnie.
 */
function laterStarts(net: Net, trips: DayTrips, access: Map<number, number>, egress: Map<number, number>, list: Journey[]): Journey[] {
  const best = [...list].sort((a, b) => a.arrive - b.arrive)[0];
  const idle = best ? idleSec(net, best) : 0;
  if (idle < LONG_WAIT) return [];
  const from = best.leave + idle - LONG_WAIT;
  return collect(net, trips, access, egress, from, from + LONG_WAIT + 30 * 60);
}

function choose(list: Journey[]): Option[] {
  if (!list.length) return [];
  const labels = new Map<Journey, Label[]>();
  const tag = (j: Journey | undefined, l: Label) => j && labels.set(j, [...(labels.get(j) ?? []), l]);
  const by = (f: (a: Journey, b: Journey) => number) => [...list].sort(f)[0];

  const earliest = by((a, b) => a.arrive - b.arrive || a.rides - b.rides || a.walk - b.walk || b.leave - a.leave);
  tag(earliest, 'earliest');
  const fastest = by((a, b) => a.arrive - a.leave - (b.arrive - b.leave) || a.arrive - b.arrive);
  if (fastest.arrive - fastest.leave < earliest.arrive - earliest.leave - 120) tag(fastest, 'fastest');
  const direct = list.filter((j) => j.rides === 1).sort((a, b) => a.arrive - b.arrive)[0];
  tag(direct, 'direct');
  const lessWalk = by((a, b) => a.walk - b.walk || a.arrive - b.arrive);
  if (lessWalk.walk < earliest.walk - 120) tag(lessWalk, 'lessWalk');

  // Reszta miejsc: kolejne odjazdy (różne kursy), żeby było z czego wybrać.
  const picked = new Set(labels.keys());
  for (const j of [...list].sort((a, b) => a.leave - b.leave)) {
    if (picked.size >= MAX_OPTIONS) break;
    picked.add(j);
  }
  return [...picked].sort((a, b) => a.leave - b.leave || a.arrive - b.arrive).map((j) => ({ ...j, labels: labels.get(j) ?? [] }));
}

/**
 * „Z przystanku X (280 m dalej) dojedziesz bez przesiadki i 50 min szybciej”: najbliższa stacja, z której w ogóle da się
 * dojechać, dostaje własny przebieg RAPTOR – porównanie nie zależy od tego, które odjazdy z okna trafiły do wyników.
 */
function comparison(net: Net, trips: DayTrips, access: Map<number, number>, egress: Map<number, number>, at: number, options: Option[]): Comparison | null {
  const best = options.find((o) => o.labels.includes('earliest'));
  const bestRide = best && firstRide(best);
  if (!best || !bestRide) return null;
  const bestStation = net.stops[bestRide.board].station;
  const byStation = new Map<number, Map<number, number>>();
  for (const [p, w] of access) {
    const st = net.stops[p].station;
    const m = byStation.get(st) ?? new Map<number, number>();
    m.set(p, w);
    byStation.set(st, m);
  }
  const walkOf = (m: Map<number, number>) => Math.min(...m.values());
  const stations = [...byStation].sort((a, b) => walkOf(a[1]) - walkOf(b[1]));
  for (const [st, acc] of stations.slice(0, 3)) {
    if (st === bestStation) return null;
    const js = raptor(net, trips, acc, egress, at, MAX_RIDES);
    if (!js.length) continue; // stąd nic nie jedzie – bierzemy kolejną stację
    const fromNearest = [...js].sort((a, b) => a.arrive - b.arrive)[0];
    const direct = best.rides === 1 && !js.some((j) => j.rides === 1);
    const fasterMin = Math.round((fromNearest.arrive - best.arrive) / 60);
    if (!direct && fasterMin < 5) return null;
    const bestWalk = access.get(bestRide.board) ?? 0;
    return { station: bestStation, fartherM: Math.max(0, Math.round(((bestWalk - walkOf(acc)) * 75) / 60 / 1.3 / 10) * 10), direct, fasterMin };
  }
  return null;
}

/** Ostatni powrót dziś: najpóźniejszy odjazd z okolic B do okolic A (szukamy od końca dnia). */
export function lastBack(net: Net, trips: DayTrips, b: LatLon, a: LatLon, from: number, radius = RADII[0]): Journey | null {
  const access = stopsNear(net, b, radius);
  const egress = stopsNear(net, a, radius);
  if (!access.size || !egress.size) return null;
  const times = departureTimes(net, trips, access, from, 30 * 3600);
  // Szukanie połówkowe: skoro z wyjścia o t da się dojechać, to z każdego wcześniejszego też (można poczekać).
  const run = (i: number) => raptor(net, trips, access, egress, times[i]);
  let best = times.length ? run(0) : [];
  if (!best.length) return null;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const js = run(mid);
    if (js.length) {
      lo = mid;
      best = js;
    } else hi = mid - 1;
  }
  return best.sort((x, y) => x.rides - y.rides || x.arrive - y.arrive)[0];
}

export function plan(
  net: Net,
  cal: Calendar | Calendar[],
  req: { from: LatLon; to: LatLon; day: ServiceDay; prev: ServiceDay; at: number; radius?: number },
): PlanResult {
  const direct = distanceM(req.from.lat, req.from.lon, req.to.lat, req.to.lon);
  const walkDirect = walkSec(direct);
  const walkOnlyMin = direct <= 2000 ? Math.max(1, Math.round(walkDirect / 60)) : null;
  const radii = req.radius ? [req.radius, Math.max(req.radius, 1500)] : RADII;
  // Cel tuż obok (do 8 min pieszo) – tylko spacer, bez autobusów.
  if (walkOnlyMin !== null && walkDirect <= WALK_ONLY_SEC) {
    return { options: [], day: req.day, daysAhead: 0, tomorrow: false, radius: radii[0], comparison: null, lastBack: null, walkOnlyMin };
  }

  const attempt = (day: ServiceDay, prev: ServiceDay, at: number) => {
    const trips = dayTrips(net, cal, day, prev);
    // Jeden przebieg z największym zasięgiem mówi, czy tego dnia w ogóle da się dojechać (RAPTOR bierze też późniejsze kursy).
    const wide = radii[radii.length - 1];
    const wideAccess = stopsNear(net, req.from, wide);
    const wideEgress = stopsNear(net, req.to, wide);
    if (!wideAccess.size || !wideEgress.size || !raptor(net, trips, wideAccess, wideEgress, at).length) return null;
    for (const radius of radii) {
      const access = stopsNear(net, req.from, radius);
      const egress = stopsNear(net, req.to, radius);
      if (!access.size || !egress.size) continue;
      for (const w of WINDOWS) {
        // Autobus ma sens tylko, gdy jest szybszy niż dojście pieszo do celu.
        const useful = (j: Journey) => walkOnlyMin === null || j.arrive - j.leave < walkDirect;
        let all = dedupe(collect(net, trips, access, egress, at, at + w)).filter(useful);
        // Okno poszerzamy, dopóki nie ma choć 2 różnych opcji (promy: 1–3 rejsy dziennie).
        if (pareto(all).length >= 2 || (all.length && w === WINDOWS[WINDOWS.length - 1])) {
          all = dedupe([...all, ...laterStarts(net, trips, access, egress, all)]).filter(useful);
          const options = choose(pareto(all));
          return { trips, radius, access, egress, at, options };
        }
      }
    }
    return null;
  };

  let day = req.day;
  let daysAhead = 0;
  let res = attempt(req.day, req.prev, req.at);
  // Dziś już nic – od razu opcje na najbliższy dzień (od rana): jutro, a dla promów nawet kilka dni dalej.
  while (!res && daysAhead < MAX_DAYS_AHEAD) {
    daysAhead += 1;
    day = addDays(req.day, daysAhead);
    res = attempt(day, addDays(req.day, daysAhead - 1), 3 * 3600);
  }
  const tomorrow = daysAhead > 0;
  if (!res) return { options: [], day: req.day, daysAhead: 0, tomorrow: false, radius: radii[radii.length - 1], comparison: null, lastBack: null, walkOnlyMin };

  const back = res.options.length ? lastBack(net, res.trips, req.to, req.from, Math.max(res.options[0].arrive, req.at), res.radius) : null;
  return {
    options: res.options,
    day,
    daysAhead,
    tomorrow,
    radius: res.radius,
    comparison: comparison(net, res.trips, res.access, res.egress, res.at, res.options),
    lastBack: back,
    walkOnlyMin,
  };
}
