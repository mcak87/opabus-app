// Teksty planera: nazwy miejsc, czas trwania, rodzaj pojazdu.
import { stationNames } from '@/data/nearby';
import { modeOf } from '@/data/queries';
import { getLang, t, type Key } from '@/i18n';

import type { Price } from './fares';
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

const eur = (v: number) => (getLang() === 'en' ? v.toFixed(2) : v.toFixed(2).replace('.', ','));

/** „6,00 €”, „do 6,00 €”, „ok. 2,30–3,00 €”, „cena u kierowcy” (zasady z README_ceny_Rodos.md). */
export function priceText(p: Price): string {
  if (p.kind === 'unknown') return t('fareUnknown');
  if (p.kind === 'exact') return t('fareExact', { price: eur(p.min) });
  if (p.kind === 'upTo') return t('fareUpTo', { price: eur(p.max) });
  return p.min === p.max ? t('fareApprox', { price: eur(p.min) }) : t('fareApproxRange', { min: eur(p.min), max: eur(p.max) });
}
