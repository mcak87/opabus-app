// Paczki offline regionów: manifest → pobranie .sqlite.gz → kontrola sha256 → rozpakowanie → podmiana atomowa.
// Format: OpaBus_paczki_offline_format.md (schemat 1).
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { gunzipSync } from 'fflate';

import { logError } from '@/lib/errorLog';
import { fetchTimeout } from '@/lib/fetchTimeout';

import { loadCalendar, loadMeta, type Calendar, type Db, type RegionMeta } from './queries';

/**
 * Adres danych: EXPO_PUBLIC_DATA_URL, jeśli ustawiony. W trakcie budowy aplikacji (serwer Expo) – ten sam komputer,
 * port 8787 (`npm run dane`), więc zmiana adresu komputera w Wi-Fi niczego nie psuje. W wersji sklepowej – opabus.com.
 */
function dataUrl(): string {
  if (process.env.EXPO_PUBLIC_DATA_URL) return process.env.EXPO_PUBLIC_DATA_URL;
  const devHost = __DEV__ ? Constants.expoConfig?.hostUri?.split(':')[0] : undefined;
  return devHost ? `http://${devHost}:8787` : 'https://opabus.com';
}
export const DATA_URL = dataUrl().replace(/\/$/, '');
export const SUPPORTED_SCHEMA = 1;

export type PackageInfo = {
  region: string;
  version: string;
  file: string;
  bytes: number;
  bytes_raw: number;
  sha256: string;
  valid_from: string;
  valid_to: string;
  stops: number;
  stations: number;
  routes: number;
  trips: number;
  bbox: [number, number, number, number];
};
export type Manifest = { schema: number; generated: string; packages: PackageInfo[] };

export type RegionName = { pl: string; en: string; el: string };
export type RegionGroup = { id: string; name: RegionName; regions: { id: string; name: RegionName; status: string }[] };

export type Installed = { region: string; version: string; validTo: number; bytes: number; installedAt: string };

const K_MANIFEST = 'data.manifest.v1';
const K_REGIONS = 'data.regions.v1';
const K_PKG = 'data.pkg.v1.';

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetchTimeout(`${DATA_URL}${path}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return (await res.json()) as T;
}

export async function fetchManifest(): Promise<Manifest> {
  const m = await getJson<Manifest>('/data/v1/offline/manifest.json');
  if (!m || !Array.isArray(m.packages)) throw new Error('Nieprawidłowy manifest');
  await Storage.setItem(K_MANIFEST, JSON.stringify(m));
  return m;
}

/**
 * Zapis z pamięci telefonu. Uszkodzony wpis (np. przerwany zapis) kasujemy i traktujemy jak brak – inaczej błąd
 * przy starcie blokowałby uruchomienie aplikacji za każdym razem. `valid` – minimalne sprawdzenie kształtu.
 */
function readStored<T>(key: string, valid: (v: unknown) => boolean): T | null {
  const s = Storage.getItemSync(key);
  if (!s) return null;
  try {
    const v = JSON.parse(s) as unknown;
    if (valid(v)) return v as T;
  } catch {
    // niżej – jak nieprawidłowy kształt
  }
  logError(`storage ${key}`, new Error('Uszkodzony zapis – usunięty'));
  Storage.removeItemSync(key);
  return null;
}

export function cachedManifest(): Manifest | null {
  return readStored<Manifest>(K_MANIFEST, (v) => !!v && Array.isArray((v as Manifest).packages));
}

export async function fetchRegionGroups(): Promise<RegionGroup[]> {
  const r = await getJson<{ groups: RegionGroup[] }>('/data/v1/regions.json');
  await Storage.setItem(K_REGIONS, JSON.stringify(r.groups));
  return r.groups;
}

export function cachedRegionGroups(): RegionGroup[] | null {
  return readStored<RegionGroup[]>(K_REGIONS, Array.isArray);
}

const isInstalled = (v: unknown) => !!v && typeof (v as Installed).region === 'string' && typeof (v as Installed).version === 'string';

export function listInstalled(): Record<string, Installed> {
  const out: Record<string, Installed> = {};
  for (const k of Storage.getAllKeysSync()) {
    if (!k.startsWith(K_PKG)) continue;
    // Uszkodzony wpis = region jak niepobrany (plik bazy zostaje, ponowne pobranie go nadpisze).
    const i = readStored<Installed>(k, isInstalled);
    if (i) out[i.region] = i;
  }
  return out;
}

/** Wersja paczki regionu w telefonie ('' – brak) – bez przeglądania wszystkich wpisów jak listInstalled(). */
export function installedVersion(region: string): string {
  return readStored<Installed>(K_PKG + region, isInstalled)?.version ?? '';
}

// ---------- Pliki bazy ----------

function dbDirectory(): Directory {
  const raw = String(SQLite.defaultDatabaseDirectory);
  const dir = new Directory(raw.startsWith('file:') ? raw : `file://${raw}`);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const dbName = (region: string) => `region_${region}.sqlite`;

type OpenRegion = { db: Db; raw: SQLite.SQLiteDatabase; cal: Calendar; meta: RegionMeta };
const open = new Map<string, Promise<OpenRegion>>();

export function openRegion(region: string): Promise<OpenRegion> {
  let p = open.get(region);
  if (!p) {
    p = (async () => {
      const raw = await SQLite.openDatabaseAsync(dbName(region), { useNewConnection: true });
      const db: Db = { all: (sql, params = []) => raw.getAllAsync(sql, params) };
      const [cal, meta] = await Promise.all([loadCalendar(db), loadMeta(db)]);
      return { db, raw, cal, meta };
    })();
    open.set(region, p);
    p.catch(() => open.delete(region));
  }
  return p;
}

async function closeRegion(region: string) {
  const p = open.get(region);
  open.delete(region);
  if (p) {
    try {
      (await p).raw.closeSync();
    } catch {
      // baza mogła już być zamknięta
    }
  }
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Dlaczego rozkład się nie zainstalował – do komunikatu na ekranie: brak/zerwany internet (także uszkodzone pobranie),
 * paczka dla nowszej wersji aplikacji, błąd zapisu w telefonie (np. brak miejsca).
 */
export type InstallFailure = 'network' | 'appUpdate' | 'storage';
export class InstallError extends Error {
  constructor(
    readonly reason: InstallFailure,
    message: string,
  ) {
    super(message);
    this.name = 'InstallError';
  }
}

/** Pobieranie w toku, po regionie – drugie wywołanie (np. aktualizacja w tle i dotknięcie w Profilu) czeka na pierwsze. */
const jobs = new Map<string, Promise<Installed>>();

/**
 * Pobiera i instaluje paczkę regionu. Stara paczka zostaje, dopóki nowa nie jest sprawdzona.
 * onProgress – część pobrana 0…1 (rozmiar z manifestu, gdy serwer nie poda Content-Length).
 * Błąd zawsze jako InstallError.
 */
export function installPackage(pkg: PackageInfo, manifestSchema: number, onProgress?: (part: number) => void): Promise<Installed> {
  let job = jobs.get(pkg.region);
  if (!job) {
    job = runInstall(pkg, manifestSchema, onProgress).finally(() => jobs.delete(pkg.region));
    jobs.set(pkg.region, job);
  }
  return job;
}

async function runInstall(pkg: PackageInfo, manifestSchema: number, onProgress?: (part: number) => void): Promise<Installed> {
  if (manifestSchema > SUPPORTED_SCHEMA) throw new InstallError('appUpdate', 'Wymagana aktualizacja aplikacji');
  const tmpDir = new Directory(Paths.cache, 'opabus-download');
  const target = new File(tmpDir, pkg.file);
  let gzFile: File;
  try {
    tmpDir.create({ intermediates: true, idempotent: true });
    gzFile = await File.downloadFileAsync(`${DATA_URL}/data/v1/offline/${pkg.file}`, target, {
      idempotent: true,
      onProgress: onProgress
        ? ({ bytesWritten, totalBytes }) => onProgress(Math.min(1, bytesWritten / (totalBytes > 0 ? totalBytes : pkg.bytes || 1)))
        : undefined,
    });
  } catch (e) {
    if (target.exists) target.delete();
    throw new InstallError('network', `Pobieranie ${pkg.file}: ${String(e)}`);
  }
  const tmpName = `${dbName(pkg.region)}.tmp`;
  try {
    const gz = await gzFile.bytes();
    const hash = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, gz));
    // Niezgodna suma = plik przerwany albo uszkodzony po drodze – ponowne pobranie zwykle pomaga.
    if (hash !== pkg.sha256) throw new InstallError('network', `Suma kontrolna się nie zgadza (${pkg.region})`);
    const raw = gunzipSync(gz);

    const dir = dbDirectory();
    const tmp = new File(dir, tmpName);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(raw);

    await closeRegion(pkg.region);
    // move() jest asynchroniczne – wpis o nowej wersji dopiero, gdy plik jest na miejscu.
    await tmp.move(new File(dir, dbName(pkg.region)), { overwrite: true });

    const info: Installed = {
      region: pkg.region,
      version: pkg.version,
      validTo: Number(pkg.valid_to),
      bytes: pkg.bytes_raw,
      installedAt: new Date().toISOString(),
    };
    Storage.setItemSync(K_PKG + pkg.region, JSON.stringify(info));
    return info;
  } catch (e) {
    if (e instanceof InstallError) throw e;
    throw new InstallError('storage', `Zapis ${pkg.region}: ${String(e)}`);
  } finally {
    if (gzFile.exists) gzFile.delete();
    // Po błędzie zapisu (np. pełna pamięć) nie zostawiamy połówki bazy. Nowy obiekt File – po move() stary wskazuje już bazę.
    try {
      const left = new File(dbDirectory(), tmpName);
      if (left.exists) left.delete();
    } catch {
      // plik mógł zniknąć sam
    }
  }
}

export async function removePackage(region: string) {
  await closeRegion(region);
  const f = new File(dbDirectory(), dbName(region));
  if (f.exists) f.delete();
  Storage.removeItemSync(K_PKG + region);
}
