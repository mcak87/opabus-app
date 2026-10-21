// Ulubione przystanki – format zapisu i dopasowanie do wersji rozkładu. Bez React Native (testy: scripts/test-favorites.ts).
//
// Numer stacji w paczce zmienia się przy każdej przebudowie paczki, a kody słupków z GTFS – nie. Dlatego ulubiony
// trzyma kody, nazwę i położenie, a numer stacji tylko „dla wersji paczki `version`”. Po instalacji nowej wersji
// numer liczymy od nowa (refreshFavorite); dopóki się nie da, ulubionego nie pokazujemy – lepiej niż odjazdy innego przystanku.
import { resolveStation, stationCodes, type Db } from './queries.ts';

export type Favorite = {
  region: string;
  /** Kody słupków z GTFS (stops.code). Puste tylko we wpisach przeniesionych z wersji 1, zanim je uzupełnimy. */
  codes: string[];
  /** Numer stacji w paczce `version`; -1 = przystanku nie ma w tej wersji rozkładu. */
  station: number;
  /** Wersja paczki, do której pasuje `station` (manifest `version`); '' = jeszcze nie sprawdzone. */
  version: string;
  name: string;
  name_en: string;
  lat?: number;
  lon?: number;
};

const str = (x: unknown) => (typeof x === 'string' ? x : '');
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';

/** Wpisy „favorites.v2” – z odrzuceniem uszkodzonych. */
export function parseFavorites(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).flatMap((f) => {
    if (typeof f.region !== 'string' || typeof f.station !== 'number') return [];
    const codes = Array.isArray(f.codes) ? f.codes.filter((c): c is string => typeof c === 'string' && c !== '') : [];
    const lat = num(f.lat);
    const lon = num(f.lon);
    return [{ region: f.region, codes, station: f.station, version: str(f.version), name: str(f.name), name_en: str(f.name_en), ...(lat != null && lon != null ? { lat, lon } : {}) }];
  });
}

/**
 * Wpisy „favorites.v1” (do 10.2026: sam numer stacji) → v2 bez kodów i bez wersji. Kody uzupełni refreshFavorite
 * przy pierwszym uruchomieniu – numer jeszcze z tej samej paczki, sprawdzony nazwą przystanku.
 */
export function migrateFavoritesV1(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .filter((f) => typeof f.region === 'string' && typeof f.station === 'number')
    .map((f) => ({ region: f.region as string, codes: [], station: f.station as number, version: '', name: str(f.name), name_en: str(f.name_en) }));
}

/** Ulubione do pokazania: region w telefonie, numer stacji z tej samej wersji paczki co zainstalowana. */
export function activeFavorites(favs: Favorite[], installed: Record<string, { version: string } | undefined>): Favorite[] {
  return favs.filter((f) => f.station >= 0 && installed[f.region]?.version === f.version);
}

/** Klucz wpisu (region, wersja, numer) – do podmiany po przeliczeniu. */
export const favoriteKey = (f: Pick<Favorite, 'region' | 'version' | 'station'>) => `${f.region}|${f.version}|${f.station}`;

/** Ulubiony dopasowany do paczki w wersji `version` (otwartej jako `db`). Nie znaleziono – station -1, reszta bez zmian. */
export async function refreshFavorite(db: Db, f: Favorite, version: string): Promise<Favorite> {
  const st = await resolveStation(db, f);
  if (!st) return { ...f, station: -1, version };
  const codes = await stationCodes(db, st.id);
  return { ...f, station: st.id, version, codes: codes.length ? codes : f.codes, name: st.name, name_en: st.name_en, lat: st.lat, lon: st.lon };
}

/** Po przeliczeniu dwa stare wpisy mogą wskazać tę samą stację – zostaje pierwszy. */
export function dedupeFavorites(favs: Favorite[]): Favorite[] {
  const seen = new Set<string>();
  return favs.filter((f) => {
    if (f.station < 0) return true;
    const k = favoriteKey(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
