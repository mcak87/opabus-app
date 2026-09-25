// Zapytania do paczki offline regionu (schemat 1 – OpaBus_paczki_offline_format.md).
// Moduł nie zależy od React Native: działa z expo-sqlite w aplikacji i z node:sqlite w testach (scripts/).

import { distanceM } from '../lib/geo.ts';
import { hhmm, type Now, type ServiceDay } from '../lib/time.ts';

export type SqlParam = string | number | null;
export interface Db {
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
}

/** Typy tras wg GTFS: 0 tramwaj, 1 metro, 2 kolej, 3 autobus, 4 prom, 11 trolejbus. */
export type Mode = 'tram' | 'metro' | 'rail' | 'bus' | 'ferry' | 'trolleybus';
export function modeOf(routeType: number): Mode {
  switch (routeType) {
    case 0:
      return 'tram';
    case 1:
      return 'metro';
    case 2:
      return 'rail';
    case 4:
      return 'ferry';
    case 11:
      return 'trolleybus';
    default:
      return 'bus';
  }
}

export type RegionMeta = { region: string; validFrom: number; validTo: number; generated: string };

export async function loadMeta(db: Db): Promise<RegionMeta> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM meta');
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    region: m.region ?? '',
    validFrom: Number(m.valid_from ?? 0),
    validTo: Number(m.valid_to ?? 0),
    generated: m.generated ?? '',
  };
}

// ---------- Kalendarz ----------

export type Calendar = { isActive(serviceId: number, day: ServiceDay): boolean };

export async function loadCalendar(db: Db): Promise<Calendar> {
  const services = await db.all<{ id: number; days: number; start_date: number; end_date: number }>(
    'SELECT id, days, start_date, end_date FROM services',
  );
  const dates = await db.all<{ service_id: number; date: number; type: number }>(
    'SELECT service_id, date, type FROM service_dates',
  );
  const byId = new Map(services.map((s) => [s.id, s]));
  const exceptions = new Map(dates.map((d) => [`${d.service_id}:${d.date}`, d.type]));
  return {
    isActive(serviceId, day) {
      const ex = exceptions.get(`${serviceId}:${day.date}`);
      if (ex === 1) return true;
      if (ex === 2) return false;
      const s = byId.get(serviceId);
      return !!s && s.start_date <= day.date && day.date <= s.end_date && (s.days & (1 << day.weekday)) !== 0;
    },
  };
}

// ---------- Przystanki i stacje ----------

export type Station = { id: number; name: string; name_en: string; lat: number; lon: number };
export type NearbyStation = Station & { dist: number };

export async function nearbyStations(db: Db, lat: number, lon: number, maxM = 800, limit = 8): Promise<NearbyStation[]> {
  const dLat = maxM / 111320;
  const dLon = maxM / (111320 * Math.cos((lat * Math.PI) / 180));
  const rows = await db.all<Station>(
    'SELECT id, name, name_en, lat, lon FROM stations WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?',
    [lat - dLat, lat + dLat, lon - dLon, lon + dLon],
  );
  return rows
    .map((r) => ({ ...r, dist: distanceM(lat, lon, r.lat, r.lon) }))
    .filter((r) => r.dist <= maxM)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}

/** Stacje w prostokącie (widoczny fragment mapy). */
export async function stationsInBox(db: Db, south: number, west: number, north: number, east: number, limit = 600): Promise<Station[]> {
  return db.all<Station>('SELECT id, name, name_en, lat, lon FROM stations WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT ?', [
    south,
    north,
    west,
    east,
    limit,
  ]);
}

/**
 * Węzły regionu: przystanki z największą liczbą linii (potem kursów), rozrzucone po różnych miejscowościach
 * (min. odstęp w metrach). Liczba linii, a nie kursów – inaczej wygrywa jedna częsta linia miejska.
 */
export async function popularStations(db: Db, limit = 6, minGapM = 3500): Promise<Station[]> {
  const rows = await db.all<Station>(
    `SELECT st.id, st.name, st.name_en, st.lat, st.lon
       FROM trips t
       JOIN patterns p ON p.id = t.pattern_id
       JOIN pattern_stops ps ON ps.pattern_id = t.pattern_id
       JOIN stops s ON s.id = ps.stop_id
       JOIN stations st ON st.id = s.station_id
      GROUP BY st.id
      ORDER BY COUNT(DISTINCT p.route_id) DESC, COUNT(*) DESC
      LIMIT 300`,
  );
  const out: Station[] = [];
  for (const r of rows) {
    if (out.some((o) => distanceM(o.lat, o.lon, r.lat, r.lon) < minGapM)) continue;
    out.push({ id: r.id, name: r.name, name_en: r.name_en, lat: r.lat, lon: r.lon });
    if (out.length >= limit) break;
  }
  return out;
}

export async function stationById(db: Db, id: number): Promise<Station | null> {
  const rows = await db.all<Station>('SELECT id, name, name_en, lat, lon FROM stations WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/** Kod przystanku z GTFS (ten sam co w linkach /s/<region>/<kod>) → stacja. */
export async function stationIdForStopCode(db: Db, code: string): Promise<number | null> {
  const rows = await db.all<{ station_id: number }>('SELECT station_id FROM stops WHERE code = ?', [code]);
  return rows[0]?.station_id ?? null;
}

/** Normalizacja jak kolumna stops.search: małe litery, bez akcentów, ς→σ. */
export function normalizeSearch(q: string): string {
  return q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .trim();
}

export async function searchStations(db: Db, query: string, limit = 30): Promise<Station[]> {
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  return db.all<Station>(
    `SELECT DISTINCT st.id, st.name, st.name_en, st.lat, st.lon
       FROM stops s JOIN stations st ON st.id = s.station_id
      WHERE s.search LIKE ?
      ORDER BY (s.search LIKE ?) DESC, st.name
      LIMIT ?`,
    [`%${q}%`, `${q}%`, limit],
  );
}

// ---------- Odjazdy ----------

export type Departure = {
  /** sekundy od północy dnia „dziś” (kursy z wczoraj po północy są przesunięte o −24 h) */
  dep: number;
  time: string;
  est: boolean;
  tripId: number;
  stopId: number;
  headsign: string;
  routeId: number;
  shortName: string;
  longName: string;
  mode: Mode;
  color: string | null;
  textColor: string | null;
  agency: string;
  agencyCode: string;
  /** 0 = kurs dnia dzisiejszego, -1 = kurs z wczoraj po północy */
  dayOffset: 0 | -1;
};

type DepRow = {
  dep: number;
  trip_id: number;
  service_id: number;
  est: number;
  stop_id: number;
  headsign: string;
  route_id: number;
  short_name: string;
  long_name: string;
  type: number;
  color: string;
  text_color: string;
  agency: string | null;
  agency_code: string | null;
};

const DEP_SQL = `
SELECT t.start + ps.dep_offset AS dep, t.id AS trip_id, t.service_id AS service_id, ps.est AS est, ps.stop_id AS stop_id,
       p.headsign AS headsign, r.id AS route_id, r.short_name AS short_name, r.long_name AS long_name,
       r.type AS type, r.color AS color, r.text_color AS text_color, a.name AS agency, a.code AS agency_code
  FROM stops s
  JOIN pattern_stops ps ON ps.stop_id = s.id
  JOIN patterns p ON p.id = ps.pattern_id
  JOIN trips t ON t.pattern_id = p.id
  JOIN routes r ON r.id = p.route_id
  LEFT JOIN agencies a ON a.id = r.agency_id
 WHERE s.station_id = ?
   AND ps.seq < p.stop_count - 1
   AND ps.pickup <> 1
   AND t.start + ps.dep_offset BETWEEN ? AND ?
 ORDER BY dep`;

function toDeparture(r: DepRow, shift: number, dayOffset: 0 | -1): Departure {
  const dep = r.dep - shift;
  return {
    dep,
    time: hhmm(dep),
    est: r.est === 1,
    tripId: r.trip_id,
    stopId: r.stop_id,
    headsign: r.headsign,
    routeId: r.route_id,
    shortName: r.short_name || r.long_name,
    longName: r.long_name,
    mode: modeOf(r.type),
    color: r.color ? `#${r.color.replace('#', '')}` : null,
    textColor: r.text_color ? `#${r.text_color.replace('#', '')}` : null,
    agency: r.agency ?? '',
    agencyCode: r.agency_code ?? '',
    dayOffset,
  };
}

/**
 * Odjazdy ze stacji w oknie [fromSec, toSec] liczonym od północy dnia `now`.
 * Uwzględnia kursy z poprzedniego dnia, które odjeżdżają po północy (start + offset ≥ 24 h).
 */
export async function stationDepartures(
  db: Db,
  cal: Calendar,
  stationId: number,
  now: Now,
  fromSec: number,
  toSec: number,
): Promise<Departure[]> {
  const today = await db.all<DepRow>(DEP_SQL, [stationId, fromSec, toSec]);
  const yesterday = await db.all<DepRow>(DEP_SQL, [stationId, fromSec + 86400, toSec + 86400]);
  const out = [
    ...today.filter((r) => cal.isActive(r.service_id, now)).map((r) => toDeparture(r, 0, 0)),
    ...yesterday.filter((r) => cal.isActive(r.service_id, now.prev)).map((r) => toDeparture(r, 86400, -1)),
  ];
  // Jedna stacja = kilka słupków; kurs może przejechać przez dwa z nich – zostawiamy pierwszy odjazd.
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.dep - b.dep)
    .filter((d) => {
      const k = `${d.dayOffset}:${d.tripId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Ostatni odjazd dziś w każdym kierunku (headsign) – do karty „Ostatni autobus”. */
export async function lastDeparturesToday(db: Db, cal: Calendar, stationId: number, now: Now): Promise<Departure[]> {
  const all = await stationDepartures(db, cal, stationId, now, 0, 2 * 86400);
  const last = new Map<string, Departure>();
  for (const d of all) if (d.dayOffset === 0) last.set(d.headsign, d);
  return [...last.values()].sort((a, b) => a.dep - b.dep);
}

// ---------- Przebieg kursu ----------

export type TripStop = {
  seq: number;
  time: string;
  sec: number;
  est: boolean;
  stopId: number;
  stationId: number;
  name: string;
  name_en: string;
};

export async function tripTimeline(db: Db, tripId: number): Promise<TripStop[]> {
  const rows = await db.all<{
    seq: number;
    dep_offset: number;
    est: number;
    stop_id: number;
    station_id: number;
    name: string;
    name_en: string;
    start: number;
  }>(
    `SELECT ps.seq, ps.dep_offset, ps.est, s.id AS stop_id, s.station_id, s.name, s.name_en, t.start
       FROM trips t
       JOIN pattern_stops ps ON ps.pattern_id = t.pattern_id
       JOIN stops s ON s.id = ps.stop_id
      WHERE t.id = ?
      ORDER BY ps.seq`,
    [tripId],
  );
  return rows.map((r) => ({
    seq: r.seq,
    sec: r.start + r.dep_offset,
    time: hhmm(r.start + r.dep_offset),
    est: r.est === 1,
    stopId: r.stop_id,
    stationId: r.station_id,
    name: r.name,
    name_en: r.name_en,
  }));
}
