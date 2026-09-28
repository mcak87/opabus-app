// Pliki cen regionów: pobierane z opabus.com razem z paczką rozkładów i trzymane w telefonie (działają offline).
import Storage from 'expo-sqlite/kv-store';

import type { FareFile } from '@/planner/fares';

import { DATA_URL } from './packages';

const key = (region: string) => `fares.v1.${region}`;
const memory = new Map<string, FareFile | null>();

/** Cennik z telefonu (albo null – region bez cennika). */
export function cachedFares(region: string): FareFile | null {
  if (memory.has(region)) return memory.get(region)!;
  try {
    const raw = Storage.getItemSync(key(region));
    const v = raw ? (JSON.parse(raw) as FareFile | { none: true }) : null;
    const file = v && 'routes' in v ? v : null;
    memory.set(region, file);
    return file;
  } catch {
    return null;
  }
}

/** Pobiera cennik regionu (404 = region bez cennika). Błąd sieci nie usuwa zapisanego cennika. */
export async function fetchFares(region: string): Promise<FareFile | null> {
  const res = await fetch(`${DATA_URL}/data/v1/ceny/${region}.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (res.status === 404) {
    Storage.setItemSync(key(region), JSON.stringify({ none: true }));
    memory.set(region, null);
    return null;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const file = (await res.json()) as FareFile;
  if (!file || file.schema !== 1 || !file.routes) throw new Error('Nieprawidłowy plik cen');
  Storage.setItemSync(key(region), JSON.stringify(file));
  memory.set(region, file);
  return file;
}

export function removeFares(region: string) {
  Storage.removeItemSync(key(region));
  memory.delete(region);
}
