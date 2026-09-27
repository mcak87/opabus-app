// Mapy offline regionów: paczki MapLibre z kafelkami OpenFreeMap dla prostokąta regionu. Mapa sama korzysta
// z nich bez internetu. Moduł MapLibre wczytujemy dynamicznie – w Expo Go go nie ma (wtedy mapy offline brak).
import type { OfflinePack, OfflinePackStatus } from '@maplibre/maplibre-react-native';
import { useSyncExternalStore } from 'react';

import { MAP_STYLE } from '@/constants/map';
import { IS_EXPO_GO } from '@/lib/runtime';

export const MAPS_SUPPORTED = !IS_EXPO_GO;

const MIN_ZOOM = 5;
/** Górna granica kafelków w paczce – duże regiony dostają mniej szczegółowe przybliżenia (mapa i tak je powiększy). */
const MAX_TILES = 8000;
/** Średni rozmiar kafelka wektorowego do szacowania wielkości pobrania (zmierzony na Rodos). */
const AVG_TILE_BYTES = 11_000;
const PACK_VERSION = 1;

export type MapPackInfo = { state: 'downloading' | 'ready' | 'error'; percent: number; bytes: number };
type Store = Record<string, MapPackInfo>;

let store: Store = {};
const listeners = new Set<() => void>();

function put(region: string, info: MapPackInfo | null) {
  const next = { ...store };
  if (info) next[region] = info;
  else delete next[region];
  store = next;
  listeners.forEach((l) => l());
}

/** Stan map offline wszystkich regionów (odświeża się w trakcie pobierania). */
export function useMapPacks(): Store {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store,
  );
}

// ---------- Szacowanie ----------

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Liczba kafelków dla bbox paczki [minLat, minLon, maxLat, maxLon] i zakresu przybliżeń. */
function tileCount(bbox: number[], z0: number, z1: number): number {
  let n = 0;
  for (let z = z0; z <= z1; z++) n += (lonToX(bbox[3], z) - lonToX(bbox[1], z) + 1) * (latToY(bbox[0], z) - latToY(bbox[2], z) + 1);
  return n;
}

function maxZoomFor(bbox: number[]): number {
  for (const z of [14, 13, 12]) if (tileCount(bbox, MIN_ZOOM, z) <= MAX_TILES) return z;
  return 11;
}

/** Przybliżony rozmiar mapy offline regionu w bajtach. */
export function estimateMapBytes(bbox: number[]): number {
  return tileCount(bbox, MIN_ZOOM, maxZoomFor(bbox)) * AVG_TILE_BYTES;
}

// ---------- Paczki ----------

const offline = async () => (await import('@maplibre/maplibre-react-native')).OfflineManager;
const regionOf = (pack: OfflinePack) => (typeof pack.metadata?.region === 'string' ? (pack.metadata.region as string) : null);

function fromStatus(s: OfflinePackStatus): MapPackInfo {
  const done = s.state === 'complete' || (s.requiredResourceCount > 0 && s.completedResourceCount >= s.requiredResourceCount);
  return { state: done ? 'ready' : 'downloading', percent: done ? 100 : Math.floor(s.percentage), bytes: s.completedResourceSize };
}

const onProgress = (region: string) => (_pack: OfflinePack, status: OfflinePackStatus) => put(region, fromStatus(status));
const onError = (region: string) => () => put(region, { ...(store[region] ?? { percent: 0, bytes: 0 }), state: 'error' });

/** Wczytuje zapisane mapy przy starcie; niedokończone pobieranie wznawia. */
export async function loadMapPacks() {
  if (!MAPS_SUPPORTED) return;
  const om = await offline();
  for (const pack of await om.getPacks()) {
    const region = regionOf(pack);
    if (!region) continue;
    const info = fromStatus(await pack.status());
    put(region, info);
    if (info.state === 'downloading') {
      await om.addListener(pack.id, onProgress(region), onError(region));
      await pack.resume();
    }
  }
}

/** Pobiera mapę offline regionu (w tle – postęp w useMapPacks). */
export async function downloadMap(region: string, bbox: number[]) {
  if (!MAPS_SUPPORTED) return;
  await deleteMap(region); // np. po błędzie – zaczynamy od nowa
  put(region, { state: 'downloading', percent: 0, bytes: 0 });
  const om = await offline();
  try {
    await om.createPack(
      {
        mapStyle: MAP_STYLE,
        bounds: [bbox[1], bbox[0], bbox[3], bbox[2]],
        minZoom: MIN_ZOOM,
        maxZoom: maxZoomFor(bbox),
        metadata: { region, v: PACK_VERSION },
      },
      onProgress(region),
      onError(region),
    );
  } catch {
    onError(region)();
  }
}

export async function deleteMap(region: string) {
  if (!MAPS_SUPPORTED) return;
  const om = await offline();
  for (const pack of await om.getPacks()) {
    if (regionOf(pack) === region) {
      om.removeListener(pack.id);
      await om.deletePack(pack.id);
    }
  }
  put(region, null);
}
