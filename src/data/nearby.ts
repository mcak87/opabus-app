// Najbliższe stacje z odjazdami – z kilku paczek naraz (region + kolej/promy, jeśli są w telefonie).
import { getLang } from '@/i18n';
import type { LatLon } from '@/lib/geo';
import type { Now } from '@/lib/time';

import { OVERLAY_REGIONS } from './DataContext';
import { openRegion } from './packages';
import { nearbyStations, stationDepartures, type Departure, type NearbyStation } from './queries';

export type StationWithDeps = NearbyStation & { region: string; departures: Departure[] };

/** Nazwa do wyświetlenia: łacińska (name_en), chyba że język grecki albo brak tłumaczenia. */
export function stationNames(st: { name: string; name_en: string }): { main: string; sub: string | null } {
  const en = st.name_en?.trim();
  if (!en || en === st.name) return { main: st.name, sub: null };
  return getLang() === 'el' ? { main: st.name, sub: en } : { main: en, sub: st.name };
}

export async function loadNearby(
  p: LatLon,
  regions: string[],
  now: Now,
  opts: { maxM?: number; stations?: number; perStation?: number; windowMin?: number } = {},
): Promise<StationWithDeps[]> {
  const { stations = 5, perStation = 3, windowMin = 90 } = opts;
  const list = [...new Set(regions)];
  let found: (NearbyStation & { region: string })[] = [];
  for (const radius of [opts.maxM ?? 800, 1500]) {
    found = [];
    for (const region of list) {
      const { db } = await openRegion(region);
      const near = await nearbyStations(db, p.lat, p.lon, radius, stations);
      found.push(...near.map((s) => ({ ...s, region })));
    }
    // Same paczki ogólnokrajowe (kolej, promy) nie kończą szukania – próbujemy większy zasięg.
    if (found.some((s) => !OVERLAY_REGIONS.has(s.region))) break;
  }
  const nearest = found.sort((a, b) => a.dist - b.dist).slice(0, stations);
  return Promise.all(
    nearest.map(async (st) => {
      const { db, cal } = await openRegion(st.region);
      const deps = await stationDepartures(db, cal, st.id, now, now.sec - 60, now.sec + windowMin * 60);
      return { ...st, departures: deps.filter((d) => d.dep >= now.sec - 30).slice(0, perStation) };
    }),
  );
}

/** „za 8 min” / „teraz” / godzina, gdy odjazd jest dalej niż za godzinę. */
export function minutesTo(dep: number, nowSec: number): number {
  return Math.max(0, Math.round((dep - nowSec) / 60));
}
