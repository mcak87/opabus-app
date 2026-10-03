// Teksty planera: nazwy miejsc, czas trwania, rodzaj pojazdu, linia, dzień.
import { stationNames } from '@/data/nearby';
import { lineLabel, modeOf } from '@/data/queries';
import { decimal, t, type Key } from '@/i18n';
import { formatDate, hhmm, type ServiceDay } from '@/lib/time';

import type { Price } from './fares';
import type { Net } from './raptor';
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

/** Napis na plakietce linii wzorca (numer, a prom – armator). */
export function patternLabel(net: Net, pattern: number): string {
  const r = net.routes.get(net.patterns[pattern].route);
  return r ? lineLabel(r.shortName, r.longName, r.type, r.agencyName) || '?' : '?';
}

/** Godzina z dopiskiem „+1”, gdy wypada następnego dnia (nocny prom, pociąg po północy). */
export function hhmmDay(sec: number): string {
  const days = Math.floor(sec / 86400);
  return days > 0 ? `${hhmm(sec)} +${days}` : hhmm(sec);
}

/** „Dziś” / „Jutro” / „czw. 08.10” – dzień, na który pokazujemy połączenia. */
export function dayName(day: ServiceDay, daysAhead: number): string {
  if (daysAhead === 0) return t('today');
  if (daysAhead === 1) return t('tomorrow');
  return `${t(`wd${day.weekday}` as Key)} ${formatDate(day.date).slice(0, 5)}`;
}

const eur = (v: number) => decimal(v.toFixed(2));

/** „6,00 €”, „do 6,00 €”, „ok. 2,30–3,00 €”, „cena u kierowcy” / „cena u przewoźnika” (zasady z README_ceny_Rodos.md). */
export function priceText(p: Price): string {
  if (p.kind === 'unknown') return t(p.operator ? 'fareUnknownOperator' : 'fareUnknown');
  if (p.kind === 'exact') return t('fareExact', { price: eur(p.min) });
  if (p.kind === 'upTo') return t('fareUpTo', { price: eur(p.max) });
  return p.min === p.max ? t('fareApprox', { price: eur(p.min) }) : t('fareApproxRange', { min: eur(p.min), max: eur(p.max) });
}
