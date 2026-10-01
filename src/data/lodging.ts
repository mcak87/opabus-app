// „Mój nocleg” – punkt zapisany tylko w telefonie (lib/settings). Tu: ustawianie z punktu lub przystanku i nazwy na ekranie.
import { t } from '@/i18n';
import type { LatLon } from '@/lib/geo';
import { setLodging, type Lodging } from '@/lib/settings';
import { regionFor } from '@/planner/service';
import type { Place } from '@/planner/store';

import { stationNames } from './nearby';
import { openRegion, type PackageInfo } from './packages';
import { nearbyStations } from './queries';

/** Zapisuje nocleg w punkcie (najmniejszy pobrany region, który go obejmuje). false = punkt poza pobranymi regionami. */
export async function setLodgingAt(p: LatLon, packages: PackageInfo[]): Promise<boolean> {
  const region = regionFor(packages, p, p);
  if (!region) return false;
  const { db } = await openRegion(region);
  const near = (await nearbyStations(db, p.lat, p.lon, 1500, 1))[0];
  setLodging({ region, lat: p.lat, lon: p.lon, near: near ? { name: near.name, name_en: near.name_en } : null });
  return true;
}

/** Nocleg z miejsca wybranego w wyszukiwarce (przystanek albo punkt). */
export async function setLodgingFromPlace(p: Place, packages: PackageInfo[]): Promise<boolean> {
  if (p.kind === 'me') return false;
  if (p.kind === 'station') {
    setLodging({ region: p.region, lat: p.lat, lon: p.lon, near: { name: p.name, name_en: p.name_en } });
    return true;
  }
  return setLodgingAt(p, packages);
}

/** Nazwa na ekranie: najbliższy przystanek (nazwa w języku użytkownika). */
export function lodgingStopName(l: Lodging): string | null {
  return l.near ? stationNames(l.near).main : null;
}

/** Nocleg jako miejsce w planerze trasy. */
export function lodgingPlace(l: Lodging): Place {
  const name = t('lodgingTitle');
  return { kind: 'point', lat: l.lat, lon: l.lon, name, name_en: name };
}
