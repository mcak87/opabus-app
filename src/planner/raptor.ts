// Planer trasy – silnik. RAPTOR (Delling, Pajor, Werneck 2012) na paczce offline regionu: rundy = liczba przejazdów,
// wiele przystanków startowych i docelowych (każdy z własnym czasem dojścia), przesiadki piesze do 400 m.
// Wersja zakresowa: osobne przebiegi dla kolejnych odjazdów w oknie czasu, potem wybór opcji (options.ts).
// Czysty TypeScript – działa w aplikacji i w testach na komputerze (scripts/test-planner.ts).
import type { Calendar, Db } from '../data/queries.ts';
import { distanceM, WALK_FACTOR, WALK_M_PER_MIN, type LatLon } from '../lib/geo.ts';
import type { ServiceDay } from '../lib/time.ts';

/** Czas przejścia w sekundach: linia prosta × 1,3 przy 4,5 km/h (zasady planera z CLAUDE.md). */
export const walkSec = (straightM: number) => Math.round(((straightM * WALK_FACTOR) / WALK_M_PER_MIN) * 60);

const TRANSFER_RADIUS_M = 400;
/** Minimalny czas na przesiadkę na tym samym przystanku. */
const MIN_CHANGE_SEC = 60;
const DAY = 86400;

// ---------- Sieć (raz na paczkę regionu) ----------

export type NetStop = { id: number; code: string; station: number; lat: number; lon: number; name: string; nameEn: string };
export type NetRoute = {
  id: number;
  /** route_id z GTFS (np. KTEL_LIN) – klucz cennika. */
  code: string;
  shortName: string;
  longName: string;
  type: number;
  color: string | null;
  textColor: string | null;
  agencyCode: string;
  agencyName: string;
};
export type NetPattern = {
  id: number;
  route: number;
  headsign: string;
  stops: Int32Array; // indeksy przystanków w kolejności
  arr: Int32Array; // offset przyjazdu [s]
  dep: Int32Array; // offset odjazdu [s]
  canBoard: Uint8Array;
  canAlight: Uint8Array;
  est: Uint8Array;
  trips: { id: number; service: number; start: number }[]; // wg startu
};
export type Net = {
  stops: NetStop[];
  stopIndex: Map<number, number>;
  stationStops: Map<number, number[]>;
  patterns: NetPattern[];
  /** Dla przystanku: [wzorzec, pozycja] */
  stopPatterns: [number, number][][];
  /** Przesiadki piesze: [przystanek docelowy, sekundy] */
  transfers: [number, number][][];
  routes: Map<number, NetRoute>;
};

export async function loadNet(db: Db): Promise<Net> {
  const [stopRows, stationRows, patRows, psRows, tripRows, routeRows] = await Promise.all([
    db.all<{ id: number; code: string; station_id: number; lat: number; lon: number }>('SELECT id, code, station_id, lat, lon FROM stops ORDER BY id'),
    db.all<{ id: number; name: string; name_en: string }>('SELECT id, name, name_en FROM stations'),
    db.all<{ id: number; route_id: number; headsign: string }>('SELECT id, route_id, headsign FROM patterns ORDER BY id'),
    db.all<{ pattern_id: number; seq: number; stop_id: number; arr_offset: number; dep_offset: number; pickup: number; drop_off: number; est: number }>(
      'SELECT pattern_id, seq, stop_id, arr_offset, dep_offset, pickup, drop_off, est FROM pattern_stops ORDER BY pattern_id, seq',
    ),
    db.all<{ id: number; pattern_id: number; service_id: number; start: number }>('SELECT id, pattern_id, service_id, start FROM trips ORDER BY pattern_id, start'),
    db.all<{ id: number; route_code: string | null; short_name: string; long_name: string; type: number; color: string | null; text_color: string | null; code: string | null; name: string | null }>(
      'SELECT r.id, r.code AS route_code, r.short_name, r.long_name, r.type, r.color, r.text_color, a.code, a.name FROM routes r LEFT JOIN agencies a ON a.id = r.agency_id',
    ),
  ]);

  const stationName = new Map(stationRows.map((s) => [s.id, s]));
  const stops: NetStop[] = stopRows.map((s) => ({
    id: s.id,
    code: s.code ?? '',
    station: s.station_id,
    lat: s.lat,
    lon: s.lon,
    name: stationName.get(s.station_id)?.name ?? '',
    nameEn: stationName.get(s.station_id)?.name_en ?? '',
  }));
  const stopIndex = new Map(stops.map((s, i) => [s.id, i]));
  const stationStops = new Map<number, number[]>();
  stops.forEach((s, i) => stationStops.set(s.station, [...(stationStops.get(s.station) ?? []), i]));

  // Wzorce z przystankami i kursami.
  const patIndex = new Map(patRows.map((p, i) => [p.id, i]));
  const psBy: (typeof psRows)[] = patRows.map(() => []);
  for (const r of psRows) {
    const i = patIndex.get(r.pattern_id);
    if (i !== undefined) psBy[i].push(r);
  }
  const tripsBy: NetPattern['trips'][] = patRows.map(() => []);
  for (const t of tripRows) {
    const i = patIndex.get(t.pattern_id);
    if (i !== undefined) tripsBy[i].push({ id: t.id, service: t.service_id, start: t.start });
  }
  const patterns: NetPattern[] = patRows.map((p, i) => {
    const rows = psBy[i];
    const n = rows.length;
    const pat: NetPattern = {
      id: p.id,
      route: p.route_id,
      headsign: p.headsign ?? '',
      stops: new Int32Array(n),
      arr: new Int32Array(n),
      dep: new Int32Array(n),
      canBoard: new Uint8Array(n),
      canAlight: new Uint8Array(n),
      est: new Uint8Array(n),
      trips: tripsBy[i],
    };
    rows.forEach((r, k) => {
      pat.stops[k] = stopIndex.get(r.stop_id) ?? -1;
      pat.arr[k] = r.arr_offset ?? r.dep_offset;
      pat.dep[k] = r.dep_offset ?? r.arr_offset;
      pat.canBoard[k] = r.pickup !== 1 && k < n - 1 ? 1 : 0;
      pat.canAlight[k] = r.drop_off !== 1 && k > 0 ? 1 : 0;
      pat.est[k] = r.est ? 1 : 0;
    });
    return pat;
  });

  const stopPatterns: [number, number][][] = stops.map(() => []);
  patterns.forEach((p, pi) => p.stops.forEach((s, pos) => s >= 0 && stopPatterns[s].push([pi, pos])));

  const transfers = buildTransfers(stops);
  const routes = new Map<number, NetRoute>(
    routeRows.map((r) => [
      r.id,
      {
        id: r.id,
        code: r.route_code ?? '',
        shortName: r.short_name ?? '',
        longName: r.long_name ?? '',
        type: r.type,
        color: r.color,
        textColor: r.text_color,
        agencyCode: r.code ?? '',
        agencyName: r.name ?? '',
      },
    ]),
  );
  return { stops, stopIndex, stationStops, patterns, stopPatterns, transfers, routes };
}

/** Przesiadki piesze: przystanki do 400 m od siebie (siatka ~400 m, żeby nie porównywać wszystkich par). */
function buildTransfers(stops: NetStop[]): [number, number][][] {
  const cell = 0.004;
  const grid = new Map<string, number[]>();
  const key = (lat: number, lon: number) => `${Math.floor(lat / cell)}:${Math.floor(lon / cell)}`;
  stops.forEach((s, i) => grid.set(key(s.lat, s.lon), [...(grid.get(key(s.lat, s.lon)) ?? []), i]));
  return stops.map((s, i) => {
    const out: [number, number][] = [];
    const cy = Math.floor(s.lat / cell);
    const cx = Math.floor(s.lon / cell);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const j of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
          if (j === i) continue;
          const d = distanceM(s.lat, s.lon, stops[j].lat, stops[j].lon);
          if (d <= TRANSFER_RADIUS_M || stops[j].station === s.station) out.push([j, Math.max(MIN_CHANGE_SEC, walkSec(d))]);
        }
    return out;
  });
}

// ---------- Kursy danego dnia ----------

/** Kursy wzorca kursujące w dniu `day` (+ nocne z dnia poprzedniego, przesunięte o −24 h), posortowane wg startu. */
export type DayTrips = { starts: Float64Array; ids: Int32Array; dayOffset: Int8Array }[];

export function dayTrips(net: Net, cal: Calendar, day: ServiceDay, prev: ServiceDay): DayTrips {
  return net.patterns.map((p) => {
    const last = p.arr.length ? p.arr[p.arr.length - 1] : 0;
    const list: [number, number, number][] = [];
    for (const t of p.trips) {
      if (cal.isActive(t.service, day)) list.push([t.start, t.id, 0]);
      if (t.start + last >= DAY && cal.isActive(t.service, prev)) list.push([t.start - DAY, t.id, -1]);
    }
    list.sort((a, b) => a[0] - b[0]);
    return {
      starts: Float64Array.from(list, (x) => x[0]),
      ids: Int32Array.from(list, (x) => x[1]),
      dayOffset: Int8Array.from(list, (x) => x[2]),
    };
  });
}

function lowerBound(a: Float64Array, v: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------- Dojście do przystanków ----------

/** Przystanki (indeksy) w promieniu od punktu z czasem dojścia [s]. */
export function stopsNear(net: Net, p: LatLon, radiusM: number): Map<number, number> {
  const out = new Map<number, number>();
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((p.lat * Math.PI) / 180));
  net.stops.forEach((s, i) => {
    if (Math.abs(s.lat - p.lat) > dLat || Math.abs(s.lon - p.lon) > dLon) return;
    const d = distanceM(p.lat, p.lon, s.lat, s.lon);
    if (d <= radiusM) out.set(i, walkSec(d));
  });
  return out;
}

// ---------- Wynik ----------

export type WalkLeg = { kind: 'walk'; from: number | 'origin'; to: number | 'dest'; sec: number; start: number; end: number };
export type RideLeg = {
  kind: 'ride';
  pattern: number;
  trip: number;
  board: number; // przystanek (indeks)
  alight: number;
  boardPos: number;
  alightPos: number;
  dep: number;
  arr: number;
  depEst: boolean;
  arrEst: boolean;
};
export type Leg = WalkLeg | RideLeg;
export type Journey = {
  /** Wyjście z punktu startowego (najpóźniej, żeby zdążyć) i dotarcie do celu – sekundy dnia `day`. */
  leave: number;
  arrive: number;
  rides: number;
  walk: number;
  legs: Leg[];
};

// ---------- RAPTOR ----------

const NONE = 0;
const ACCESS = 1;
const RIDE = 2;
const WALK = 3;

type Rounds = {
  tau: Float64Array[];
  kind: Int8Array[];
  a: Int32Array[]; // RIDE: wzorzec, WALK: przystanek źródłowy
  b: Int32Array[]; // RIDE: indeks kursu w DayTrips, WALK: sekundy
  c: Int32Array[]; // RIDE: pozycja wsiadania
  d: Int32Array[]; // RIDE: pozycja wysiadania
};

/**
 * Jeden przebieg RAPTOR od godziny `depart`: najwcześniejsze dotarcie do celu przy 1…maxRides przejazdach.
 * Zwraca podróże, które coś poprawiają (mniej przejazdów albo wcześniejszy przyjazd).
 */
export function raptor(
  net: Net,
  trips: DayTrips,
  access: Map<number, number>,
  egress: Map<number, number>,
  depart: number,
  maxRides = 3,
): Journey[] {
  const n = net.stops.length;
  const K = maxRides;
  const R: Rounds = { tau: [], kind: [], a: [], b: [], c: [], d: [] };
  for (let k = 0; k <= K; k++) {
    R.tau.push(new Float64Array(n).fill(Infinity));
    R.kind.push(new Int8Array(n));
    R.a.push(new Int32Array(n));
    R.b.push(new Int32Array(n));
    R.c.push(new Int32Array(n));
    R.d.push(new Int32Array(n));
  }
  const best = new Float64Array(n).fill(Infinity);
  let marked = new Set<number>();
  for (const [p, w] of access) {
    R.tau[0][p] = depart + w;
    R.kind[0][p] = ACCESS;
    R.b[0][p] = w;
    best[p] = depart + w;
    marked.add(p);
  }

  let target = Infinity;
  const found: { k: number; stop: number; arrive: number }[] = [];

  for (let k = 1; k <= K && marked.size; k++) {
    const tau = R.tau[k];
    const prev = R.tau[k - 1];
    // Etykiety z poprzedniej rundy przechodzą dalej (NONE = „patrz runda niżej”).
    tau.set(prev);

    const queue = new Map<number, number>();
    for (const p of marked) for (const [pi, pos] of net.stopPatterns[p]) queue.set(pi, Math.min(queue.get(pi) ?? Infinity, pos));

    const improved = new Set<number>();
    for (const [pi, startPos] of queue) {
      const pat = net.patterns[pi];
      const dt = trips[pi];
      if (!dt.starts.length) continue;
      let t = -1;
      let boardPos = -1;
      for (let pos = startPos; pos < pat.stops.length; pos++) {
        const p = pat.stops[pos];
        if (p < 0) continue;
        if (t >= 0 && pat.canAlight[pos]) {
          const arr = dt.starts[t] + pat.arr[pos];
          if (arr < Math.min(best[p], target)) {
            tau[p] = arr;
            best[p] = arr;
            R.kind[k][p] = RIDE;
            R.a[k][p] = pi;
            R.b[k][p] = t;
            R.c[k][p] = boardPos;
            R.d[k][p] = pos;
            improved.add(p);
          }
        }
        if (pat.canBoard[pos] && prev[p] < Infinity) {
          const ready = prev[p] + (k > 1 && R.kind[k - 1][p] === RIDE ? MIN_CHANGE_SEC : 0);
          if (t < 0 || ready <= dt.starts[t] + pat.dep[pos]) {
            const idx = lowerBound(dt.starts, ready - pat.dep[pos]);
            if (idx < dt.starts.length && (t < 0 || idx < t || boardPos < 0)) {
              t = idx;
              boardPos = pos;
            }
          }
        }
      }
    }

    // Przesiadki piesze od przystanków, do których dojechaliśmy w tej rundzie.
    for (const p of [...improved]) {
      for (const [q, sec] of net.transfers[p]) {
        const arr = tau[p] + sec;
        if (arr < Math.min(best[q], target)) {
          tau[q] = arr;
          best[q] = arr;
          R.kind[k][q] = WALK;
          R.a[k][q] = p;
          R.b[k][q] = sec;
          improved.add(q);
        }
      }
    }

    // Cel: przystanki w zasięgu dojścia do punktu B.
    let bestHere = Infinity;
    let bestStop = -1;
    for (const [p, w] of egress) {
      if (R.kind[k][p] === NONE) continue; // bez nowego przejazdu w tej rundzie
      const arr = tau[p] + w;
      if (arr < bestHere) {
        bestHere = arr;
        bestStop = p;
      }
    }
    if (bestStop >= 0 && bestHere < target) {
      target = bestHere;
      found.push({ k, stop: bestStop, arrive: bestHere });
    }
    marked = improved;
  }

  return found.map((f) => rebuild(net, trips, R, f.k, f.stop, egress.get(f.stop) ?? 0, f.arrive));
}

function rebuild(net: Net, trips: DayTrips, R: Rounds, kEnd: number, stop: number, egressSec: number, arrive: number): Journey {
  const legs: Leg[] = [{ kind: 'walk', from: stop, to: 'dest', sec: egressSec, start: arrive - egressSec, end: arrive }];
  let k = kEnd;
  let p = stop;
  let rides = 0;
  let guard = 0;
  while (guard++ < 50) {
    const kind = R.kind[k][p];
    if (kind === NONE) {
      k -= 1;
      continue;
    }
    if (kind === ACCESS) {
      const w = R.b[0][p];
      legs.unshift({ kind: 'walk', from: 'origin', to: p, sec: w, start: R.tau[0][p] - w, end: R.tau[0][p] });
      break;
    }
    if (kind === WALK) {
      const from = R.a[k][p];
      const sec = R.b[k][p];
      legs.unshift({ kind: 'walk', from, to: p, sec, start: R.tau[k][p] - sec, end: R.tau[k][p] });
      p = from;
      continue;
    }
    // RIDE
    const pi = R.a[k][p];
    const t = R.b[k][p];
    const bPos = R.c[k][p];
    const aPos = R.d[k][p];
    const pat = net.patterns[pi];
    const start = trips[pi].starts[t];
    legs.unshift({
      kind: 'ride',
      pattern: pi,
      trip: trips[pi].ids[t],
      board: pat.stops[bPos],
      alight: pat.stops[aPos],
      boardPos: bPos,
      alightPos: aPos,
      dep: start + pat.dep[bPos],
      arr: start + pat.arr[aPos],
      depEst: !!pat.est[bPos],
      arrEst: !!pat.est[aPos],
    });
    rides += 1;
    p = pat.stops[bPos];
    k -= 1;
  }
  // Odejście ze startu „na styk”: pierwszy przejazd minus dojście (i ew. przejście między przystankami).
  const firstRide = legs.findIndex((l) => l.kind === 'ride');
  const before = (legs.slice(0, Math.max(0, firstRide)) as WalkLeg[]).reduce((s, l) => s + l.sec, 0);
  const dep = firstRide >= 0 ? (legs[firstRide] as RideLeg).dep - before : (legs[0] as WalkLeg).start;
  let t = dep;
  for (let i = 0; i < firstRide; i++) {
    const l = legs[i] as WalkLeg;
    l.start = t;
    l.end = t + l.sec;
    t = l.end;
  }
  const walk = legs.reduce((s, l) => s + (l.kind === 'walk' ? l.sec : 0), 0);
  return { leave: dep, arrive, rides, walk, legs };
}

// ---------- Zakres odjazdów ----------

/** Godziny wyjścia z punktu A, przy których da się złapać jakiś kurs z przystanków w zasięgu, w oknie [from, to]. */
export function departureTimes(net: Net, trips: DayTrips, access: Map<number, number>, from: number, to: number): number[] {
  const set = new Set<number>();
  for (const [p, w] of access) {
    for (const [pi, pos] of net.stopPatterns[p]) {
      const pat = net.patterns[pi];
      if (!pat.canBoard[pos]) continue;
      const dt = trips[pi];
      for (let i = lowerBound(dt.starts, from + w - pat.dep[pos]); i < dt.starts.length; i++) {
        const leave = dt.starts[i] + pat.dep[pos] - w;
        if (leave > to) break;
        set.add(Math.floor(leave / 60) * 60);
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}
