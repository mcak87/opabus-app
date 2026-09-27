// Teksty planera: nazwy miejsc, czas trwania, rodzaj pojazdu.
import { stationNames } from '@/data/nearby';
import { modeOf } from '@/data/queries';
import { t, type Key } from '@/i18n';

import type { Place } from './store';

export function placeName(p: Place | null): string {
  if (!p) return '';
  if (p.kind === 'me') return t('myLocation');
  return stationNames(p).main;
}

export function duration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? t('durMin', { min }) : t('durHMin', { h: Math.floor(min / 60), min: min % 60 });
}

/** „Autobus”, „Prom”… wg typu trasy GTFS. */
export function modeName(routeType: number): string {
  return t(modeOf(routeType) as Key);
}
