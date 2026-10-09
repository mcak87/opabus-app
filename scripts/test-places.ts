// Wyszukiwanie miejsc na prawdziwych plikach strony (trafność i czas):  node scripts/test-places.ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { prepareItems, searchItems, type PlaceItem, type RawItem } from '../src/data/placesSearch.ts';

const DIR = 'C:/Users/cizio/OneDrive/Desktop/Apliakcja Publiczny transport/strona-opabus/public/data/v1/miejsca';
const load = (region: string): [string, PlaceItem[]] => {
  const t0 = performance.now();
  const body = JSON.parse(gunzipSync(readFileSync(`${DIR}/${region}.json.gz`)).toString('utf8')) as { items: RawItem[] };
  const items = prepareItems(body.items);
  console.log(`${region}: ${items.length} pozycji, wczytanie ${Math.round(performance.now() - t0)} ms`);
  return [region, items];
};

const rodos = [load('rodos')];
const ateny = [load('ateny')];
const faliraki = { lat: 36.3398, lon: 28.2012 };
const syntagma = { lat: 37.9755, lon: 23.7348 };

let fail = 0;
const expect = (label: string, regions: [string, PlaceItem[]][], q: string, near: typeof faliraki | null, test: (names: string[]) => boolean) => {
  const t0 = performance.now();
  const hits = searchItems(regions, q, near, 8);
  const ms = Math.round(performance.now() - t0);
  const names = hits.map((h) => `${h.latin} [${h.cat}]`);
  const ok = test(names);
  if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'BŁĄD', `${label} „${q}” (${ms} ms):`, names.slice(0, 5).join(' | '));
};

expect('hotel', rodos, 'blue bay', faliraki, (n) => n.some((x) => /blue bay/i.test(x) && x.includes('[h]')));
expect('akropol', rodos, 'lindos akropol', faliraki, (n) => n.some((x) => /acropolis|akropol/i.test(x)));
expect('plaża', rodos, 'anthony quinn', faliraki, (n) => n.some((x) => /anthony quinn/i.test(x)));
expect('po grecku', rodos, 'Λίνδος', faliraki, (n) => n.some((x) => /lindos/i.test(x)));
expect('miejscowość', rodos, 'faliraki', faliraki, (n) => n[0]?.includes('[v]') ?? false);
expect('ulica z numerem', ateny, 'ermou 21', syntagma, (n) => n[0]?.toLowerCase().startsWith('ermou 21') ?? false);
expect('ulica', ateny, 'ermou', syntagma, (n) => n.some((x) => /^ermou/i.test(x) && x.includes('[r]')));
expect('muzeum', ateny, 'acropolis museum', syntagma, (n) => n.some((x) => /acropolis museum/i.test(x)));
expect('szkoła', ateny, 'school', syntagma, (n) => n.length > 0);
// Wyrazy pospolite po polsku (i w innych językach) → nazwy z OSM (SYNONYMS w placesSearch.ts).
const medieval = (n: string[]) => n.some((x) => /medieval (city|town) of rhodes/i.test(x));
expect('stare miasto', rodos, 'stare miasto', faliraki, medieval);
expect('stare miasto – w trakcie pisania', rodos, 'stare mia', faliraki, medieval);
expect('old town', rodos, 'old town', faliraki, medieval);
expect('altstadt', rodos, 'Altstadt', faliraki, medieval);
expect('lotnisko', rodos, 'lotnisko', faliraki, (n) => n.some((x) => /airport|aerolimen|aerodrom/i.test(x)));
expect('plaża', rodos, 'plaża faliraki', faliraki, (n) => n.some((x) => /beach|paralia/i.test(x) && /faliraki/i.test(x)));
expect('stare miasto – Ateny', ateny, 'stare miasto', syntagma, (n) => n.length > 0);

console.log(fail ? `${fail} błędów` : 'Wszystko OK');
process.exitCode = fail ? 1 : 0;
