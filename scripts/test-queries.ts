// Test zapytań na prawdziwej paczce offline (bez telefonu):
//   node scripts/test-queries.ts <ścieżka do region.sqlite.gz> [lat lon] [RRRR-MM-DDTHH:MM]
// Wymaga Node 24 (node:sqlite + uruchamianie .ts).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

import {
  lastDeparturesToday,
  loadCalendar,
  loadMeta,
  nearbyStations,
  searchStations,
  stationDepartures,
  tripTimeline,
  type Db,
  type SqlParam,
} from '../src/data/queries.ts';
import { athensNow, hhmm } from '../src/lib/time.ts';
import { walkMinutes } from '../src/lib/geo.ts';

const [gzPath, latArg, lonArg, whenArg] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'opabus-'));
const file = join(dir, 'region.sqlite');
writeFileSync(file, gunzipSync(readFileSync(gzPath)));
const sqlite = new DatabaseSync(file, { readOnly: true });
const db: Db = {
  async all<T>(sql: string, params: SqlParam[] = []) {
    return sqlite.prepare(sql).all(...params) as T[];
  },
};

const lat = Number(latArg ?? 36.3395);
const lon = Number(lonArg ?? 28.2005);
const now = athensNow(whenArg ? new Date(`${whenArg}:00+03:00`) : new Date());

const meta = await loadMeta(db);
const cal = await loadCalendar(db);
console.log('region', meta, '| teraz', now.date, hhmm(now.sec), 'dzień tyg.', now.weekday);

const near = await nearbyStations(db, lat, lon, 800, 5);
for (const st of near) {
  const deps = await stationDepartures(db, cal, st.id, now, now.sec, now.sec + 3600);
  console.log(`\n${st.name} – ${Math.round(st.dist)} m, ${walkMinutes(st.dist)} min pieszo`);
  for (const d of deps.slice(0, 5)) {
    console.log(`  ${d.time}  za ${Math.round((d.dep - now.sec) / 60)} min  [${d.shortName}] → ${d.headsign}  (${d.agencyCode}, ${d.mode}${d.est ? ', ok.' : ''})`);
  }
  const last = await lastDeparturesToday(db, cal, st.id, now);
  console.log('  ostatnie dziś:', last.map((d) => `${d.time} → ${d.headsign}`).join(' | '));
}

const first = near[0] && (await stationDepartures(db, cal, near[0].id, now, now.sec, now.sec + 3600))[0];
if (first) {
  const tl = await tripTimeline(db, first.tripId);
  console.log(`\nKurs ${first.shortName} ${first.time}: ${tl.length} przystanków, ${tl[0].name} ${tl[0].time} → ${tl.at(-1)!.name} ${tl.at(-1)!.time}`);
}
console.log('\nSzukaj „lind”:', (await searchStations(db, 'lind')).map((s) => s.name).join(', '));
