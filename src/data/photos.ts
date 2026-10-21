// Zdjęcia przystanków od użytkowników (decyzja Michała 05.10.2026): pomagają znaleźć przystanek na miejscu.
// Widoczne dopiero po zatwierdzeniu przez Michała w /admin/zdjecia. Lista zatwierdzonych zdjęć regionu
// (/api/stop-photos?region=…) jest zapisana w telefonie i odświeżana co godzinę; same zdjęcia wymagają internetu
// przy pierwszym obejrzeniu (potem zostają w pamięci podręcznej expo-image).
// Wysyłanie: telefon zmniejsza zdjęcie do 1280 px i zapisuje je od nowa jako JPEG – bez metadanych (EXIF: miejsce,
// model telefonu, godzina). Zgłoszenie anonimowe: tylko przystanek, zdjęcie, opcjonalny podpis i czy był przy przystanku.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import Storage from 'expo-sqlite/kv-store';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { APP_VERSION } from '@/data/appConfig';
import { recordContribution } from '@/data/badges';
import { useData } from '@/data/DataContext';
import { DATA_URL, getJson, installedVersion, openRegion } from '@/data/packages';
import { stationCodes } from '@/data/queries';
import { getLang } from '@/i18n';
import { fetchTimeout, UPLOAD_TIMEOUT_MS } from '@/lib/fetchTimeout';
import { distanceM } from '@/lib/geo';

/** `stops` – kody słupków z GTFS (stałe), `station` – numer stacji w paczce `version` (zmienia się przy przebudowie). */
export type StopPhoto = { id: string; station: number; stops: string[]; version?: string; w: number; h: number; caption: string; created: string };
type RegionPhotos = { fetched: number; photos: StopPhoto[] };
/** Wysłane z tego telefonu i jeszcze niezatwierdzone („czeka na sprawdzenie”). `first` – przystanek nie miał jeszcze
 *  zdjęcia, gdy je wysyłano (odznaka „Odkrywca” po zatwierdzeniu). */
type Mine = { id: string; region: string; station: number; stops?: string[]; version?: string; created: string; first?: boolean };

/**
 * Czy zdjęcie (albo moje wysłane) jest z tego przystanku. Po kodach słupków z GTFS – są stałe między wersjami paczek.
 * Numer stacji tylko wtedy, gdy zdjęcie wysłano przy tej samej wersji paczki, która jest w telefonie: po przebudowie
 * paczki ten sam numer ma inny przystanek, więc zdjęcie przystanku A pokazałoby się przy B.
 */
function samePlace(p: { station: number; stops?: string[]; version?: string }, station: number, codes: string[], version: string): boolean {
  if (p.stops?.some((c) => codes.includes(c))) return true;
  return !!version && p.version === version && p.station === station;
}

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
let tick = 0;
const notify = () => {
  tick++;
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
        const photos = (Array.isArray(r.photos) ? r.photos : [])
          .filter((x) => x && typeof x.id === 'string' && Number.isInteger(x.station))
          .map((x) => ({ ...x, stops: Array.isArray(x.stops) ? x.stops.filter((c) => typeof c === 'string') : [] }));
        const next = { fetched: Date.now(), photos };
        cache.set(region, next);
        Storage.setItemSync(K_REGION + region, JSON.stringify(next));
        // Zatwierdzone zdjęcia przestają być „moje, czekające” – i liczą się do odznak.
        const before = mine.length;
        for (const m of mine) {
          if (m.region === region && photos.some((x) => x.id === m.id)) recordContribution({ kind: 'photoApproved', region, first: m.first });
        }
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
    () => tick,
  );
}

/** Kody słupków stacji w danej wersji paczki – dla kart, które znają tylko numer stacji (Start, mapa). */
const codesCache = new Map<string, Promise<string[]>>();
function codesOf(region: string, version: string, station: number): Promise<string[]> {
  const key = `${region}:${version}:${station}`;
  let p = codesCache.get(key);
  if (!p) {
    if (codesCache.size > 500) codesCache.clear();
    p = openRegion(region).then(({ db }) => stationCodes(db, station));
    p.catch(() => codesCache.delete(key));
    codesCache.set(key, p);
  }
  return p;
}

/**
 * Kody słupków przystanku: podane przez ekran (`known`) albo odczytane z paczki w telefonie po numerze stacji
 * (tylko gdy region ma jakiekolwiek zdjęcia – inaczej nie ma czego dopasowywać).
 */
function useStopCodes(region: string | undefined, station: number | undefined, version: string, known: string[] | undefined, needed: boolean): string[] {
  const key = `${region}:${version}:${station}`;
  const [found, setFound] = useState<{ key: string; codes: string[] } | null>(null);
  useEffect(() => {
    if (known || !needed || !region || station === undefined || !version) return;
    let alive = true;
    codesOf(region, version, station)
      .then((codes) => alive && setFound({ key, codes }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key, known, needed, region, station, version]);
  return known ?? (found?.key === key ? found.codes : []);
}

/**
 * Zatwierdzone zdjęcia przystanku (stacji) – po kodach słupków z GTFS (zob. samePlace). `stopCodes` – kody, gdy ekran
 * je zna (ekran przystanku, ulubione, planer); bez nich odczytujemy je z paczki po numerze stacji.
 */
export function useStationPhotos(region: string | undefined, station: number | undefined, stopCodes?: string[]): StopPhoto[] {
  // Dane z magazynu tego pliku (zmiany zgłasza useVersion) – kompilator Reacta nie może zapamiętać wyniku po samych argumentach.
  'use no memo';
  useVersion();
  // Wersja z DataContext – po aktualizacji rozkładu karta przelicza się sama, nawet gdy jej argumenty się nie zmieniły.
  const installed = useData().installed;
  useEffect(() => {
    if (region) refreshPhotos(region);
  }, [region]);
  const all = region ? regionPhotos(region).photos : [];
  const version = (region && installed[region]?.version) || '';
  const codes = useStopCodes(region, station, version, stopCodes, all.length > 0);
  if (!region || station === undefined) return [];
  return all.filter((p) => samePlace(p, station, codes, version));
}

/** Czy z tego telefonu wysłano zdjęcie tego przystanku, które czeka na sprawdzenie. */
export function usePendingMine(region: string, station: number, stopCodes: string[]): boolean {
  'use no memo';
  useVersion();
  const version = useData().installed[region]?.version ?? '';
  return mine.some((m) => m.region === region && samePlace(m, station, stopCodes, version));
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

/** Zmniejsza zdjęcie (bez metadanych) i wysyła. ok – czeka na sprawdzenie; limited – za dużo wysyłek z tego adresu
 *  (serwer: 10 na minutę), spróbować za chwilę; error – brak internetu albo odrzucone. */
export async function uploadPhoto(u: Upload): Promise<'ok' | 'limited' | 'error'> {
  // Wersja paczki, z której jest numer stacji – zapisana przy zdjęciu (numer bez niej po przebudowie paczki nic nie znaczy).
  const version = installedVersion(u.region);
  const first = !regionPhotos(u.region).photos.some((p) => samePlace(p, u.station, u.stops, version));
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
    const res = await fetchTimeout(
      `${DATA_URL}/api/stop-photo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: u.region,
          station: u.station,
          version,
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
      },
      UPLOAD_TIMEOUT_MS,
    );
    if (res.status === 429) return 'limited';
    if (!res.ok) return 'error';
    const { id } = (await res.json()) as { id?: string };
    if (id) {
      mine = [...mine, { id, region: u.region, station: u.station, stops: u.stops, version, created: new Date().toISOString(), first }].slice(-30);
      Storage.setItemSync(K_MINE, JSON.stringify(mine));
      notify();
    }
    recordContribution({ kind: 'photoSent', region: u.region });
    // Lista regionu na nowo – nowe zdjęcia innych (i nasze, gdy już zatwierdzone) bez czekania godziny.
    refreshPhotos(u.region, true).catch(() => {});
    return 'ok';
  } catch {
    return 'error';
  }
}
