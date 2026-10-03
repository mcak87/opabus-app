// Miejsca z OpenStreetMap (hotele, plaże, zabytki, szkoły, ulice, adresy…) do wyszukiwarki planera i „Mojego noclegu”.
// Plik na region: opabus.com/data/v1/miejsca/<region>.json.gz (generator: narzedzia/miejsca_osm.mjs) – pobierany razem
// z rozkładami, trzymany w telefonie, wyszukiwany bez internetu. Dane © OpenStreetMap contributors (ODbL).
import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { gunzipSync, strFromU8 } from 'fflate';

import type { LatLon } from '@/lib/geo';

import { DATA_URL } from './packages';
import { prepareItems, searchItems, type PlaceHit, type PlaceItem, type RawItem } from './placesSearch';

export type { PlaceCat, PlaceHit } from './placesSearch';

type Index = { v: 1; regions: Record<string, { file: string; bytes: number; count: number; version: string }> };

const K_VER = (region: string) => `places.ver.v1.${region}`;
const memory = new Map<string, Promise<PlaceItem[]>>();
const dir = () => new Directory(Paths.document, 'miejsca');
const fileOf = (region: string) => new File(dir(), `${region}.json.gz`);

/** Pobiera brakujące albo nowsze pliki miejsc dla podanych regionów (bez internetu – zostaje to, co w telefonie). */
export async function syncPlaces(regions: string[]): Promise<void> {
  if (!regions.length) return;
  const res = await fetch(`${DATA_URL}/data/v1/miejsca/index.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) return;
  const index = (await res.json()) as Index;
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  for (const region of regions) {
    const info = index.regions?.[region];
    if (!info || Storage.getItemSync(K_VER(region)) === info.version) continue;
    try {
      const target = fileOf(region);
      if (target.exists) target.delete();
      await File.downloadFileAsync(`${DATA_URL}/data/v1/miejsca/${info.file}`, target);
      Storage.setItemSync(K_VER(region), info.version);
      memory.delete(region);
    } catch {
      // spróbujemy przy następnym połączeniu
    }
  }
}

export function removePlaces(region: string) {
  const f = fileOf(region);
  if (f.exists) f.delete();
  Storage.removeItemSync(K_VER(region));
  memory.delete(region);
}

function load(region: string): Promise<PlaceItem[]> {
  const cached = memory.get(region);
  if (cached) return cached;
  const p = (async () => {
    const f = fileOf(region);
    if (!f.exists) return [];
    const body = JSON.parse(strFromU8(gunzipSync(await f.bytes()))) as { items: RawItem[] };
    return prepareItems(body.items);
  })();
  p.catch(() => memory.delete(region));
  memory.set(region, p);
  return p;
}

/** Wczytanie plików do pamięci zawczasu (Ateny ~0,5–2 s) – wywołać przy otwarciu wyszukiwarki. */
export function preloadPlaces(regions: string[]) {
  regions.forEach((r) => load(r).catch(() => {}));
}

/** Wyszukiwanie w miejscach pobranych regionów. `near` – bliższe wyżej. */
export async function searchPlaces(regions: string[], query: string, near: LatLon | null, limit = 12): Promise<PlaceHit[]> {
  const byRegion: [string, PlaceItem[]][] = [];
  for (const region of regions) byRegion.push([region, await load(region).catch(() => [] as PlaceItem[])]);
  return searchItems(byRegion, query, near, limit);
}
