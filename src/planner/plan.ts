// Planer trasy – wybór opcji (zasady z CLAUDE.md „Planer trasy – kilka sposobów dotarcia”):
// przystanki w zasięgu 800 m (w razie potrzeby 1,5 km), okno ok. 90 min, 3–5 naprawdę różnych opcji z etykietami,
// porównanie z najbliższym przystankiem i ostatni powrót dziś. Czysty TypeScript (testy: scripts/test-planner.ts).
import type { Calendar } from '../data/queries.ts';
import { distanceM, type LatLon } from '../lib/geo.ts';
import { addDays, type ServiceDay } from '../lib/time.ts';

import { dayTrips, departureTimes, raptor, stopsNear, walkSec, type DayTrips, type Journey, type Net, type RideLeg } from './raptor.ts';

export type Label = 'earliest' | 'fastest' | 'direct' | 'lessWalk';
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
  /** Dzień, którego dotyczą godziny (dziś albo jutro, gdy dziś już nic nie jedzie). */
  day: ServiceDay;
  tomorrow: boolean;
  radius: number;
  comparison: Comparison | null;
  lastBack: Journey | null;
  /** Gdy cel jest blisko – ile minut pieszo (bez autobusu). */
  walkOnlyMin: number | null;
};

const WINDOWS = [90 * 60, 4 * 3600, 20 * 3600];
const RADII = [800, 1500];
const MAX_RUNS = 80;
const MAX_OPTIONS = 5;

const signature = (j: Journey) =>
  j.legs
    .filter((l): l is RideLeg => l.kind === 'ride')
    .map((l) => l.trip)
    .join('>');
const firstRide = (j: Journey) => j.legs.find((l): l is RideLeg => l.kind === 'ride') ?? null;

/** Wszystkie podróże z odjazdami w oknie [from, to] (RAPTOR dla kolejnych odjazdów). */
function collect(net: Net, trips: DayTrips, access: Map<number, number>, egress: Map<number, number>, from: number, to: number): Journey[] {
  const times = departureTimes(net, trips, access, from, to).slice(0, MAX_RUNS);
  const out: Journey[] = [];
  for (const t of times) out.push(...raptor(net, trips, access, egress, t));
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

/** Zostają tylko podróże, których żadna inna nie bije we wszystkim (wyjście, przyjazd, przejazdy, chodzenie). */
function pareto(list: Journey[]): Journey[] {
  return list.filter(
    (j) =>
      !list.some(
        (i) =>
          i !== j &&
          i.leave >= j.leave &&
          i.arrive <= j.arrive &&
          i.rides <= j.rides &&
          i.walk <= j.walk &&
          (i.leave > j.leave || i.arrive < j.arrive || i.rides < j.rides || i.walk < j.walk),
      ),
  );
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

function comparison(net: Net, access: Map<number, number>, options: Option[], all: Journey[]): Comparison | null {
  const best = options.find((o) => o.labels.includes('earliest'));
  const bestRide = best && firstRide(best);
  if (!best || !bestRide) return null;
  // Najbliższy przystanek (stacja), z którego w ogóle coś jedzie w tym oknie.
  const boardStations = new Set(all.map((j) => firstRide(j)).filter(Boolean).map((r) => net.stops[r!.board].station));
  let nearest = -1;
  let nearestWalk = Infinity;
  for (const [p, w] of access) {
    const st = net.stops[p].station;
    if (boardStations.has(st) && w < nearestWalk) {
      nearest = st;
      nearestWalk = w;
    }
  }
  const bestStation = net.stops[bestRide.board].station;
  if (nearest < 0 || nearest === bestStation) return null;
  const fromNearest = all.filter((j) => net.stops[firstRide(j)!.board].station === nearest).sort((a, b) => a.arrive - b.arrive)[0];
  const direct = best.rides === 1 && (!fromNearest || fromNearest.rides > 1);
  const fasterMin = fromNearest ? Math.round((fromNearest.arrive - best.arrive) / 60) : 0;
  if (!direct && fasterMin < 5) return null;
  const bestWalk = access.get(bestRide.board) ?? 0;
  return { station: bestStation, fartherM: Math.max(0, Math.round(((bestWalk - nearestWalk) * 75) / 60 / 1.3 / 10) * 10), direct, fasterMin };
}

/** Ostatni powrót dziś: najpóźniejszy odjazd z okolic B do okolic A (szukamy od końca dnia). */
export function lastBack(net: Net, trips: DayTrips, b: LatLon, a: LatLon, from: number, radius = RADII[0]): Journey | null {
  const access = stopsNear(net, b, radius);
  const egress = stopsNear(net, a, radius);
  if (!access.size || !egress.size) return null;
  const times = departureTimes(net, trips, access, from, 30 * 3600).reverse();
  for (const t of times.slice(0, 200)) {
    const js = raptor(net, trips, access, egress, t);
    if (js.length) return js.sort((x, y) => x.rides - y.rides || x.arrive - y.arrive)[0];
  }
  return null;
}

export function plan(net: Net, cal: Calendar, req: { from: LatLon; to: LatLon; day: ServiceDay; prev: ServiceDay; at: number; radius?: number }): PlanResult {
  const direct = distanceM(req.from.lat, req.from.lon, req.to.lat, req.to.lon);
  const walkOnlyMin = direct <= 2000 ? Math.max(1, Math.round(walkSec(direct) / 60)) : null;
  const radii = req.radius ? [req.radius, Math.max(req.radius, 1500)] : RADII;

  const attempt = (day: ServiceDay, prev: ServiceDay, at: number) => {
    const trips = dayTrips(net, cal, day, prev);
    for (const radius of radii) {
      const access = stopsNear(net, req.from, radius);
      const egress = stopsNear(net, req.to, radius);
      if (!access.size || !egress.size) continue;
      for (const w of WINDOWS) {
        const all = dedupe(collect(net, trips, access, egress, at, at + w));
        if (all.length >= 2 || (all.length && w === WINDOWS[WINDOWS.length - 1])) {
          const options = choose(pareto(all));
          return { trips, radius, access, all, options };
        }
      }
    }
    return null;
  };

  let day = req.day;
  let tomorrow = false;
  let res = attempt(req.day, req.prev, req.at);
  if (!res) {
    // Dziś już nic – od razu opcje na jutro (od rana).
    tomorrow = true;
    day = addDays(req.day, 1);
    res = attempt(day, req.day, 3 * 3600);
  }
  if (!res) return { options: [], day, tomorrow, radius: radii[radii.length - 1], comparison: null, lastBack: null, walkOnlyMin };

  const back = res.options.length ? lastBack(net, res.trips, req.to, req.from, Math.max(res.options[0].arrive, req.at), res.radius) : null;
  return {
    options: res.options,
    day,
    tomorrow,
    radius: res.radius,
    comparison: comparison(net, res.access, res.options, res.all),
    lastBack: back,
    walkOnlyMin,
  };
}
