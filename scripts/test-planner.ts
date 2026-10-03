// Test planera na prawdziwych paczkach (bez telefonu). Kilka paczek po przecinku = sieć łączona (np. region + promy + kolej):
//   node scripts/test-planner.ts <region.sqlite.gz>[,<inna.sqlite.gz>…] <latA> <lonA> <latB> <lonB> [RRRR-MM-DDTHH:MM]
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

import { loadCalendar, type Db, type SqlParam } from '../src/data/queries.ts';
import { tripPrices, type FareFile, type Price } from '../src/planner/fares.ts';
import { plan } from '../src/planner/plan.ts';
import { loadNet, mergeNets, type Journey, type RideLeg } from '../src/planner/raptor.ts';
import { athensNow, hhmm } from '../src/lib/time.ts';

const [files, la, loa, lb, lob, when] = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'opabus-'));

const t0 = performance.now();
const parts = await Promise.all(
  files.split(',').map(async (file) => {
    const region = basename(file).replace('.sqlite.gz', '');
    const path = join(tmp, `${region}.sqlite`);
    writeFileSync(path, gunzipSync(readFileSync(file)));
    const sql = new DatabaseSync(path, { readOnly: true });
    const db: Db = { all: async <T,>(q: string, p: SqlParam[] = []) => sql.prepare(q).all(...p) as T[] };
    // Cennik obok paczki: …/offline/<region>.sqlite.gz → …/ceny/<region>.json
    const faresPath = join(dirname(dirname(file)), 'ceny', `${region}.json`);
    const fares: FareFile | null = existsSync(faresPath) ? JSON.parse(readFileSync(faresPath, 'utf8')) : null;
    return { region, net: await loadNet(db, region), cal: await loadCalendar(db), fares };
  }),
);
// Największa paczka pierwsza (jak w aplikacji – jej się nie kopiuje).
parts.sort((a, b) => b.net.stops.length - a.net.stops.length);
const t1 = performance.now();
const net = mergeNets(parts.map((p) => p.net));
const cals = parts.map((p) => p.cal);
const t2 = performance.now();
const now = athensNow(when ? new Date(`${when}:00+03:00`) : new Date());
const res = plan(net, cals, { from: { lat: +la, lon: +loa }, to: { lat: +lb, lon: +lob }, day: now, prev: now.prev, at: now.sec });
const t3 = performance.now();

const name = (i: number) => net.stops[i].nameEn || net.stops[i].name;
const day = (sec: number) => (sec >= 86400 ? ` (+${Math.floor(sec / 86400)} d.)` : '');
const show = (j: Journey) =>
  j.legs
    .map((l) => {
      if (l.kind === 'walk') return `pieszo ${Math.round(l.sec / 60)} min`;
      const pat = net.patterns[l.pattern];
      const r = net.routes.get(pat.route)!;
      return `[${r.shortName || r.agencyName}→${pat.headsign}] ${name(l.board)} ${hhmm(l.dep)}${l.depEst ? '~' : ''} → ${name(l.alight)} ${hhmm(l.arr)}${day(l.arr)}`;
    })
    .join(' | ');
const fmt = (j: Journey) =>
  `${hhmm(j.leave)}–${hhmm(j.arrive)}${day(j.arrive)} (${Math.round((j.arrive - j.leave) / 60)} min, ${j.rides} przejazd., pieszo ${Math.round(j.walk / 60)} min)`;

console.log(
  `sieć: ${net.regions.join('+')} – ${net.stops.length} przyst., ${net.patterns.length} wzorców; wczytanie ${(t1 - t0).toFixed(0)} ms, łączenie ${(t2 - t1).toFixed(0)} ms, planowanie ${(t3 - t2).toFixed(0)} ms`,
);
console.log(`dzień ${res.day.date}${res.daysAhead ? ` (+${res.daysAhead} d.)` : ''}, zasięg ${res.radius} m, pieszo całość: ${res.walkOnlyMin ?? '-'} min`);
const fares = Object.fromEntries(parts.filter((p) => p.fares).map((p) => [p.region, p.fares!]));
const eur = (p: Price) =>
  p.kind === 'unknown'
    ? 'nieznana'
    : p.kind === 'exact'
      ? `${p.min.toFixed(2)} €`
      : p.kind === 'upTo'
        ? `do ${p.max.toFixed(2)} €`
        : p.min === p.max
          ? `ok. ${p.min.toFixed(2)} €`
          : `ok. ${p.min.toFixed(2)}–${p.max.toFixed(2)} €`;
const priceText = (j: Journey) => {
  if (!Object.keys(fares).length) return '';
  const { rides, total } = tripPrices(fares, net, j.legs.filter((l): l is RideLeg => l.kind === 'ride'));
  return ` | cena: ${eur(total)} [${rides.map(eur).join(' + ')}]`;
};
for (const o of res.options) console.log(`\n${fmt(o)} ${o.labels.join(',')}${priceText(o)}\n   ${show(o)}`);
if (res.comparison) console.log('\nporównanie:', { ...res.comparison, station: name(net.stationStops.get(res.comparison.station)![0]) });
if (res.lastBack) console.log(`\nostatni powrót: ${fmt(res.lastBack)}\n   ${show(res.lastBack)}`);
