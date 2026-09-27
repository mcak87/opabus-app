// Test planera na prawdziwej paczce (bez telefonu):
//   node scripts/test-planner.ts <region.sqlite.gz> <latA> <lonA> <latB> <lonB> [RRRR-MM-DDTHH:MM]
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

import { loadCalendar, type Db, type SqlParam } from '../src/data/queries.ts';
import { plan } from '../src/planner/plan.ts';
import { loadNet, type Journey, type Net } from '../src/planner/raptor.ts';
import { athensNow, hhmm } from '../src/lib/time.ts';

const [file, la, loa, lb, lob, when] = process.argv.slice(2);
const path = join(mkdtempSync(join(tmpdir(), 'opabus-')), 'r.sqlite');
writeFileSync(path, gunzipSync(readFileSync(file)));
const sql = new DatabaseSync(path, { readOnly: true });
const db: Db = { all: async <T,>(q: string, p: SqlParam[] = []) => sql.prepare(q).all(...p) as T[] };

const t0 = performance.now();
const net = await loadNet(db);
const cal = await loadCalendar(db);
const t1 = performance.now();
const now = athensNow(when ? new Date(`${when}:00+03:00`) : new Date());
const res = plan(net, cal, { from: { lat: +la, lon: +loa }, to: { lat: +lb, lon: +lob }, day: now, prev: now.prev, at: now.sec });
const t2 = performance.now();

const name = (i: number) => net.stops[i].nameEn || net.stops[i].name;
const show = (j: Journey) =>
  j.legs
    .map((l) => {
      if (l.kind === 'walk') return `pieszo ${Math.round(l.sec / 60)} min`;
      const pat = net.patterns[l.pattern];
      const r = net.routes.get(pat.route)!;
      return `[${r.shortName}→${pat.headsign}] ${name(l.board)} ${hhmm(l.dep)}${l.depEst ? '~' : ''} → ${name(l.alight)} ${hhmm(l.arr)}`;
    })
    .join(' | ');
const fmt = (n: Net, j: Journey) => `${hhmm(j.leave)}–${hhmm(j.arrive)} (${Math.round((j.arrive - j.leave) / 60)} min, ${j.rides} przejazd., pieszo ${Math.round(j.walk / 60)} min)`;

console.log(`sieć: ${net.stops.length} przyst., ${net.patterns.length} wzorców – ${(t1 - t0).toFixed(0)} ms; planowanie ${(t2 - t1).toFixed(0)} ms`);
console.log(`dzień ${res.day.date}${res.tomorrow ? ' (JUTRO)' : ''}, zasięg ${res.radius} m, pieszo całość: ${res.walkOnlyMin ?? '-'} min`);
for (const o of res.options) console.log(`\n${fmt(net, o)} ${o.labels.join(',')}\n   ${show(o)}`);
if (res.comparison) console.log('\nporównanie:', { ...res.comparison, station: net.stops[net.stationStops.get(res.comparison.station)![0]].nameEn });
if (res.lastBack) console.log(`\nostatni powrót: ${fmt(net, res.lastBack)}\n   ${show(res.lastBack)}`);
