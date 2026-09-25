// Paczki offline regionów: manifest → pobranie .sqlite.gz → kontrola sha256 → rozpakowanie → podmiana atomowa.
// Format: OpaBus_paczki_offline_format.md (schemat 1).
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { gunzipSync } from 'fflate';

import { loadCalendar, loadMeta, type Calendar, type Db, type RegionMeta } from './queries';

/** Adres danych. W trakcie budowy aplikacji: EXPO_PUBLIC_DATA_URL=http://<IP komputera>:8787 (patrz README). */
export const DATA_URL = (process.env.EXPO_PUBLIC_DATA_URL || 'https://opabus.com').replace(/\/$/, '');
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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_URL}${path}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return (await res.json()) as T;
}

export async function fetchManifest(): Promise<Manifest> {
  const m = await getJson<Manifest>('/data/v1/offline/manifest.json');
  if (!m || !Array.isArray(m.packages)) throw new Error('Nieprawidłowy manifest');
  await Storage.setItem(K_MANIFEST, JSON.stringify(m));
  return m;
}

export function cachedManifest(): Manifest | null {
  const s = Storage.getItemSync(K_MANIFEST);
  return s ? (JSON.parse(s) as Manifest) : null;
}

export async function fetchRegionGroups(): Promise<RegionGroup[]> {
  const r = await getJson<{ groups: RegionGroup[] }>('/data/v1/regions.json');
  await Storage.setItem(K_REGIONS, JSON.stringify(r.groups));
  return r.groups;
}

export function cachedRegionGroups(): RegionGroup[] | null {
  const s = Storage.getItemSync(K_REGIONS);
  return s ? (JSON.parse(s) as RegionGroup[]) : null;
}

export function listInstalled(): Record<string, Installed> {
  const out: Record<string, Installed> = {};
  for (const k of Storage.getAllKeysSync()) {
    if (!k.startsWith(K_PKG)) continue;
    const v = Storage.getItemSync(k);
    if (v) {
      const i = JSON.parse(v) as Installed;
      out[i.region] = i;
    }
  }
  return out;
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

/** Pobiera i instaluje paczkę regionu. Stara paczka zostaje, dopóki nowa nie jest sprawdzona. */
export async function installPackage(pkg: PackageInfo, manifestSchema: number): Promise<Installed> {
  if (manifestSchema > SUPPORTED_SCHEMA) throw new Error('Wymagana aktualizacja aplikacji');
  const tmpDir = new Directory(Paths.cache, 'opabus-download');
  tmpDir.create({ intermediates: true, idempotent: true });
  const gzFile = await File.downloadFileAsync(`${DATA_URL}/data/v1/offline/${pkg.file}`, new File(tmpDir, pkg.file), {
    idempotent: true,
  });
  try {
    const gz = await gzFile.bytes();
    const hash = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, gz));
    if (hash !== pkg.sha256) throw new Error(`Suma kontrolna się nie zgadza (${pkg.region})`);
    const raw = gunzipSync(gz);

    const dir = dbDirectory();
    const tmp = new File(dir, `${dbName(pkg.region)}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(raw);

    await closeRegion(pkg.region);
    tmp.move(new File(dir, dbName(pkg.region)), { overwrite: true });

    const info: Installed = {
      region: pkg.region,
      version: pkg.version,
      validTo: Number(pkg.valid_to),
      bytes: pkg.bytes_raw,
      installedAt: new Date().toISOString(),
    };
    Storage.setItemSync(K_PKG + pkg.region, JSON.stringify(info));
    return info;
  } finally {
    if (gzFile.exists) gzFile.delete();
  }
}

export async function removePackage(region: string) {
  await closeRegion(region);
  const f = new File(dbDirectory(), dbName(region));
  if (f.exists) f.delete();
  Storage.removeItemSync(K_PKG + region);
}
