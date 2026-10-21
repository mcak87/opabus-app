// Ulubione przystanki po aktualizacji rozkładu (numery stacji się zmieniają, kody słupków nie):
//   node scripts/test-favorites.ts [folder z paczkami *.sqlite.gz] [region …]
// Najpierw mała sztuczna baza (przypadki brzegowe), potem prawdziwe paczki: kopia z przetasowanymi numerami stacji
// i sprawdzenie, czy każdy przystanek znajduje się po kodach słupków. Wymaga Node 24 (node:sqlite + .ts).
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

import { activeFavorites, dedupeFavorites, migrateFavoritesV1, parseFavorites, refreshFavorite, type Favorite } from '../src/data/favorites.ts';
import { resolveStation, stationCodes, type Db, type SqlParam } from '../src/data/queries.ts';

let fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'BŁĄD', label, extra);
};
const asDb = (sqlite: DatabaseSync): Db => ({
  async all<T>(sql: string, params: SqlParam[] = []) {
    return sqlite.prepare(sql).all(...params) as T[];
  },
});

// ---------- Sztuczna baza: tylko tabele, których używa dopasowanie ----------

function fakeDb(stations: [number, string, number, number][], stops: [number, string, number][]): Db {
  const s = new DatabaseSync(':memory:');
  s.exec('CREATE TABLE stations(id INTEGER PRIMARY KEY, name TEXT, name_en TEXT, lat REAL, lon REAL)');
  s.exec('CREATE TABLE stops(id INTEGER PRIMARY KEY, code TEXT, station_id INT)');
  for (const [id, name, lat, lon] of stations) s.prepare('INSERT INTO stations VALUES(?,?,?,?,?)').run(id, name, `${name} EN`, lat, lon);
  for (const [id, code, st] of stops) s.prepare('INSERT INTO stops VALUES(?,?,?)').run(id, code, st);
  return asDb(s);
}

// Wersja A paczki i wersja B po przebudowie: te same przystanki, inne numery, doszedł nowy przystanek na początku.
const A = fakeDb(
  [
    [1, 'Λίνδος', 36.091, 28.088],
    [2, 'Φαληράκι', 36.341, 28.207],
    [3, 'Αρχάγγελος', 36.213, 28.115],
    [4, 'Πλατεία', 36.4, 28.2], // „Πλατεία” w dwóch miejscowościach
    [5, 'Πλατεία', 36.1, 28.0],
  ],
  [
    [1, 'L1', 1],
    [2, 'L2', 1],
    [3, 'F1', 2],
    [4, '7', 3], // kod „7” jest też u drugiego przewoźnika regionu (stacja 2)
    [5, '7', 2],
    [6, 'P1', 4],
    [7, 'P2', 5],
  ],
);
const B = fakeDb(
  [
    [1, 'Κολύμπια', 36.25, 28.15], // nowy – numery reszty przesunięte
    [2, 'Λίνδος', 36.091, 28.088],
    [3, 'Φαληράκι', 36.3412, 28.2071],
    [4, 'Αρχάγγελος', 36.213, 28.115],
    [5, 'Πλατεία', 36.4, 28.2],
    [6, 'Πλατεία', 36.1, 28.0],
    [7, 'Σταθμός', 36.5, 28.3], // słupek „Π9” przewoźnik dał zupełnie innemu przystankowi
  ],
  [
    [1, 'K1', 1],
    [2, 'L1', 2],
    [3, 'L2', 2],
    [4, 'F1', 3],
    [5, '7', 4],
    [6, '7', 3],
    [7, 'P1', 5],
    [8, 'P2', 6],
    [9, 'Π9', 7],
  ],
);

const fav = (station: number, name: string, codes: string[], version: string, lat?: number, lon?: number): Favorite => ({
  region: 'rodos',
  station,
  name,
  name_en: `${name} EN`,
  codes,
  version,
  ...(lat != null && lon != null ? { lat, lon } : {}),
});

{
  const lindos = await refreshFavorite(B, fav(1, 'Λίνδος', ['L1', 'L2'], 'a', 36.091, 28.088), 'b');
  check('po kodach: Lindos 1 → 2', lindos.station === 2 && lindos.version === 'b', JSON.stringify(lindos));

  const arch = await refreshFavorite(B, fav(3, 'Αρχάγγελος', ['7'], 'a', 36.213, 28.115), 'b');
  check('kod zdublowany u dwóch przewoźników – wygrywa bliższa stacja', arch.station === 4, `→ ${arch.station}`);

  const fal = await refreshFavorite(B, fav(2, 'Φαληράκι', ['F1', '7'], 'a', 36.341, 28.207), 'b');
  check('więcej pasujących kodów wygrywa', fal.station === 3 && fal.codes.join() === 'F1,7', JSON.stringify(fal.codes));

  const moved = await refreshFavorite(B, fav(9, 'Αφάντου', ['Π9'], 'a', 36.29, 28.16), 'b');
  check('kod przeniesiony na daleki przystanek o innej nazwie – odrzucony', moved.station === -1, `→ ${moved.station}`);

  const gone = await refreshFavorite(B, fav(8, 'Πεύκοι', ['X1'], 'a', 36.12, 28.06), 'b');
  check('przystanku nie ma w nowej wersji → -1, kody zostają', gone.station === -1 && gone.version === 'b' && gone.codes.join() === 'X1');
  check('… i nie jest pokazywany', activeFavorites([gone], { rodos: { version: 'b' } }).length === 0);
}

// ---------- Wpisy z wersji 1 (sam numer stacji) ----------
{
  const v1 = [
    { region: 'rodos', station: 1, name: 'Λίνδος', name_en: 'Λίνδος EN' },
    { region: 'rodos', station: 4, name: 'Πλατεία', name_en: 'Πλατεία EN' },
    { region: 'rodos', station: '2', name: 'zły typ' },
    null,
  ];
  const migrated = migrateFavoritesV1(v1);
  check('v1 → v2: dobre wpisy przeniesione, uszkodzone pominięte', migrated.length === 2 && migrated.every((f) => f.codes.length === 0 && f.version === ''));
  check('v1 bez sprawdzenia nie jest pokazywany', activeFavorites(migrated, { rodos: { version: 'a' } }).length === 0);

  // Ta sama paczka co przy zapisie (typowy przypadek przy pierwszym uruchomieniu po aktualizacji aplikacji).
  const sameA = await refreshFavorite(A, migrated[0], 'a');
  check('v1, ta sama paczka: numer potwierdzony nazwą, kody uzupełnione', sameA.station === 1 && sameA.codes.join() === 'L1,L2' && sameA.lat === 36.091);
  const plateiaA = await refreshFavorite(A, migrated[1], 'a');
  check('v1, ta sama paczka: przystanek o powtarzającej się nazwie też (po numerze)', plateiaA.station === 4 && plateiaA.codes.join() === 'P1');

  // Paczka już przebudowana (region zaktualizowany ręcznie w Profilu po zapisaniu ulubionego).
  const lindosB = await refreshFavorite(B, migrated[0], 'b');
  check('v1, nowa paczka: pod numerem 1 inny przystanek – szukamy po nazwie (jedna taka)', lindosB.station === 2, `→ ${lindosB.station}`);
  const plateiaB = await refreshFavorite(B, migrated[1], 'b');
  check('v1, nowa paczka: nazwa niejednoznaczna – nie zgadujemy (-1)', plateiaB.station === -1, `→ ${plateiaB.station}`);
}

// ---------- Zapis w telefonie ----------
{
  const parsed = parseFavorites([
    { region: 'rodos', station: 2, version: 'b', codes: ['L1', 3, ''], name: 'Λίνδος', name_en: 'Lindos', lat: 36.09, lon: 28.08 },
    { region: 'rodos', station: 'x' },
    { region: 5, station: 1 },
    'śmieci',
  ]);
  check('v2: uszkodzone wpisy odrzucone, złe kody pominięte', parsed.length === 1 && parsed[0].codes.join() === 'L1' && parsed[0].lat === 36.09);
  check('parseFavorites(nie-tablica) = []', parseFavorites({ a: 1 }).length === 0 && migrateFavoritesV1('x').length === 0);
  const twice = dedupeFavorites([fav(2, 'Λίνδος', ['L1'], 'b'), fav(2, 'Λίνδος', ['L2'], 'b'), fav(-1, 'A', [], 'b'), fav(-1, 'B', [], 'b')]);
  check('dwa stare wpisy na tę samą stację → jeden; nieznalezione zostają', twice.length === 3);
  const shown = activeFavorites([fav(2, 'Λίνδος', ['L1'], 'b'), fav(3, 'Φαληράκι', ['F1'], 'a'), { ...fav(1, 'K', ['K1'], 'b'), region: 'kos' }], {
    rodos: { version: 'b' },
  });
  check('pokazujemy tylko wpisy z wersji paczki w telefonie', shown.length === 1 && shown[0].station === 2);
}

// ---------- Prawdziwe paczki: przetasowane numery stacji ----------

const dir = process.argv[2] ?? 'C:/Users/cizio/OneDrive/Desktop/Apliakcja Publiczny transport/strona-opabus/public/data/v1/offline';
const regions = process.argv.slice(3).length ? process.argv.slice(3) : ['rodos', 'kos', 'ateny'];
const work = mkdtempSync(join(tmpdir(), 'opabus-fav-'));

for (const region of regions) {
  let gz: Buffer;
  try {
    gz = readFileSync(join(dir, `${region}.sqlite.gz`));
  } catch {
    console.log('pomijam', region, '– brak paczki w', dir);
    continue;
  }
  const raw = gunzipSync(gz);
  const fa = join(work, `${region}-a.sqlite`);
  const fb = join(work, `${region}-b.sqlite`);
  writeFileSync(fa, raw);
  writeFileSync(fb, raw);
  const sa = new DatabaseSync(fa, { readOnly: true });
  const sb = new DatabaseSync(fb);

  // Wersja „po przebudowie”: każda stacja dostaje numer innej (przesunięcie o 1/3 listy).
  const ids = (sa.prepare('SELECT id FROM stations ORDER BY id').all() as { id: number }[]).map((r) => r.id);
  const shift = Math.max(1, Math.floor(ids.length / 3));
  const next = new Map(ids.map((id, i) => [id, ids[(i + shift) % ids.length]]));
  sb.exec('BEGIN');
  sb.exec('UPDATE stations SET id = -id');
  sb.exec('UPDATE stops SET station_id = -station_id');
  const upSt = sb.prepare('UPDATE stations SET id = ? WHERE id = ?');
  const upStop = sb.prepare('UPDATE stops SET station_id = ? WHERE station_id = ?');
  for (const [from, to] of next) {
    upSt.run(to, -from);
    upStop.run(to, -from);
  }
  sb.exec('COMMIT');

  const a = asDb(sa);
  const b = asDb(sb);
  const all = sa.prepare('SELECT id, name, name_en, lat, lon FROM stations').all() as { id: number; name: string; name_en: string; lat: number; lon: number }[];
  let ok = 0;
  let wrongBefore = 0;
  let v1Ok = 0;
  const misses: string[] = [];
  const t0 = performance.now();
  for (const st of all) {
    // Stary zapis: ten sam numer w nowej paczce to zwykle inny przystanek – tak było przed poprawką.
    const oldWay = sb.prepare('SELECT name FROM stations WHERE id = ?').get(st.id) as { name: string } | undefined;
    if (oldWay?.name !== st.name) wrongBefore++;

    const f: Favorite = { region, station: st.id, version: 'a', codes: await stationCodes(a, st.id), name: st.name, name_en: st.name_en, lat: st.lat, lon: st.lon };
    const r = await refreshFavorite(b, f, 'b');
    if (r.station === next.get(st.id)) ok++;
    else if (misses.length < 5) misses.push(`${st.name} ${st.id}→${r.station} (oczekiwano ${next.get(st.id)})`);

    // Wpis z wersji 1 przy pierwszym uruchomieniu (ta sama paczka): numer + nazwa.
    const v1 = await resolveStation(a, { codes: [], station: st.id, name: st.name, name_en: st.name_en });
    if (v1?.id === st.id) v1Ok++;
  }
  const ms = Math.round(performance.now() - t0);
  check(`${region}: ${ok}/${all.length} przystanków odnalezionych po kodach w przebudowanej paczce`, ok === all.length, misses.join('; '));
  check(`${region}: wpisy v1 potwierdzone w tej samej paczce ${v1Ok}/${all.length}`, v1Ok === all.length);
  console.log(`     (bez poprawki ${wrongBefore} z ${all.length} ulubionych pokazałoby inny przystanek; ${ms} ms)`);
  sa.close();
  sb.close();
}

console.log(fail ? `\n${fail} błędów` : '\nWszystko OK');
process.exit(fail ? 1 : 0);
