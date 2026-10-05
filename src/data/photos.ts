// Zdjęcia przystanków od użytkowników (decyzja Michała 05.10.2026): pomagają znaleźć przystanek na miejscu.
// Widoczne dopiero po zatwierdzeniu przez Michała w /admin/zdjecia. Lista zatwierdzonych zdjęć regionu
// (/api/stop-photos?region=…) jest zapisana w telefonie i odświeżana co godzinę; same zdjęcia wymagają internetu
// przy pierwszym obejrzeniu (potem zostają w pamięci podręcznej expo-image).
// Wysyłanie: telefon zmniejsza zdjęcie do 1280 px i zapisuje je od nowa jako JPEG – bez metadanych (EXIF: miejsce,
// model telefonu, godzina). Zgłoszenie anonimowe: tylko przystanek, zdjęcie, opcjonalny podpis i czy był przy przystanku.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import Storage from 'expo-sqlite/kv-store';
import { useEffect, useSyncExternalStore } from 'react';

import { APP_VERSION } from '@/data/appConfig';
import { DATA_URL, getJson } from '@/data/packages';
import { getLang } from '@/i18n';
import { distanceM } from '@/lib/geo';

export type StopPhoto = { id: string; station: number; stops: string[]; w: number; h: number; caption: string; created: string };
type RegionPhotos = { fetched: number; photos: StopPhoto[] };
/** Wysłane z tego telefonu i jeszcze niezatwierdzone („czeka na sprawdzenie”). */
type Mine = { id: string; region: string; station: number; created: string };

const K_REGION = 'photos.v1.';
const K_MINE = 'photos.mine.v1';
const REFRESH_MS = 3600_000;
const REFRESH_PENDING_MS = 5 * 60_000;
const MAX_SIDE = 1280;
const NEAR_M = 150;

export const photoUrl = (id: string) => `${DATA_URL}/api/stop-photo-img/${id}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = Storage.getItemSync(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

const cache = new Map<string, RegionPhotos>();
let mine: Mine[] = readJson<Mine[]>(K_MINE, []);
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};
const inflight = new Map<string, Promise<void>>();

function regionPhotos(region: string): RegionPhotos {
  let r = cache.get(region);
  if (!r) {
    r = readJson<RegionPhotos>(K_REGION + region, { fetched: 0, photos: [] });
    cache.set(region, r);
  }
  return r;
}

/** Pobiera listę zatwierdzonych zdjęć regionu (najwyżej raz na godzinę, chyba że `force`). */
export function refreshPhotos(region: string, force = false): Promise<void> {
  // Czekające na sprawdzenie zdjęcie z tego telefonu – sprawdzamy częściej, czy już jest widoczne.
  const every = mine.some((m) => m.region === region) ? REFRESH_PENDING_MS : REFRESH_MS;
  if (!force && Date.now() - regionPhotos(region).fetched < every) return Promise.resolve();
  let p = inflight.get(region);
  if (!p) {
    p = getJson<{ photos?: StopPhoto[] }>(`/api/stop-photos?region=${encodeURIComponent(region)}`)
      .then((r) => {
        const photos = Array.isArray(r.photos) ? r.photos.filter((x) => x && typeof x.id === 'string' && Number.isInteger(x.station)) : [];
        const next = { fetched: Date.now(), photos };
        cache.set(region, next);
        Storage.setItemSync(K_REGION + region, JSON.stringify(next));
        // Zatwierdzone zdjęcia przestają być „moje, czekające”.
        const before = mine.length;
        mine = mine.filter((m) => m.region !== region || !photos.some((x) => x.id === m.id));
        if (mine.length !== before) Storage.setItemSync(K_MINE, JSON.stringify(mine));
        notify();
      })
      .catch(() => {})
      .finally(() => inflight.delete(region));
    inflight.set(region, p);
  }
  return p;
}

function useVersion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}

/** Zatwierdzone zdjęcia przystanku (stacji) – po numerze stacji albo kodzie słupka z GTFS (numery w paczkach się zmieniają). */
export function useStationPhotos(region: string | undefined, station: number | undefined, stopCodes: string[] = []): StopPhoto[] {
  useVersion();
  useEffect(() => {
    if (region) refreshPhotos(region);
  }, [region]);
  if (!region || station === undefined) return [];
  return regionPhotos(region).photos.filter((p) => p.station === station || p.stops.some((c) => stopCodes.includes(c)));
}

/** Czy z tego telefonu wysłano zdjęcie tego przystanku, które czeka na sprawdzenie. */
export function usePendingMine(region: string, station: number): boolean {
  useVersion();
  return mine.some((m) => m.region === region && m.station === station);
}

export type Upload = {
  region: string;
  station: number;
  stationName: string;
  stops: string[];
  lat: number;
  lon: number;
  uri: string;
  width: number;
  height: number;
  caption: string;
};

/** Zmniejsza zdjęcie (bez metadanych) i wysyła. ok – czeka na sprawdzenie; error – brak internetu albo odrzucone. */
export async function uploadPhoto(u: Upload): Promise<'ok' | 'error'> {
  const scale = Math.min(1, MAX_SIDE / Math.max(u.width, u.height));
  const ctx = ImageManipulator.manipulate(u.uri);
  if (scale < 1) ctx.resize({ width: Math.round(u.width * scale), height: Math.round(u.height * scale) });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.72, format: SaveFormat.JPEG, base64: true });
  let near: boolean | null = null;
  try {
    if ((await Location.getForegroundPermissionsAsync()).granted) {
      const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
      if (pos) near = distanceM(pos.coords.latitude, pos.coords.longitude, u.lat, u.lon) <= NEAR_M;
    }
  } catch {
    near = null;
  }
  try {
    const res = await fetch(`${DATA_URL}/api/stop-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: u.region,
        station: u.station,
        stationName: u.stationName,
        stops: u.stops,
        lat: u.lat,
        lon: u.lon,
        w: out.width,
        h: out.height,
        caption: u.caption.trim(),
        near,
        consent: true,
        app: APP_VERSION,
        lang: getLang(),
        image: out.base64,
      }),
    });
    if (!res.ok) return 'error';
    const { id } = (await res.json()) as { id?: string };
    if (id) {
      mine = [...mine, { id, region: u.region, station: u.station, created: new Date().toISOString() }].slice(-30);
      Storage.setItemSync(K_MINE, JSON.stringify(mine));
      notify();
    }
    // Lista regionu na nowo – nowe zdjęcia innych (i nasze, gdy już zatwierdzone) bez czekania godziny.
    refreshPhotos(u.region, true).catch(() => {});
    return 'ok';
  } catch {
    return 'error';
  }
}
