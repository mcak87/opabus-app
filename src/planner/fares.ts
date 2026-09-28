// Ceny przejazdów z pliku cen regionu (/data/v1/ceny/<region>.json, budowany przez narzedzia/ceny_do_aplikacji.mjs).
// Zasady (README_ceny_Rodos.md): cena z miasta → dokładna; przejazd nie z miasta → „do X €” (cena dalszego końca);
// przewoźnik bez potwierdzonego cennika (RODA) → „ok. X €”; brak ceny → „cena u kierowcy”. Czysty TypeScript.
import type { Net, RideLeg } from './raptor.ts';

type FarePoint = { p?: number; min?: number; max?: number; none?: boolean; exact: boolean; place: string };
export type FareFile = {
  schema: number;
  region: string;
  generated: string;
  validTo: string;
  operators: Record<string, { confirmed: boolean; reduced?: number[]; label: Record<string, string> }>;
  routes: Record<string, { op: string; flat?: FarePoint; town?: string[]; stops?: Record<string, FarePoint> }>;
};

export type Price = { kind: 'exact' | 'upTo' | 'approx' | 'unknown'; min: number; max: number; op: string };

const UNKNOWN = (op = ''): Price => ({ kind: 'unknown', min: 0, max: 0, op });
const valueOf = (x: FarePoint) => x.p ?? x.max ?? 0;

export function ridePrice(file: FareFile, net: Net, leg: RideLeg): Price {
  const route = net.routes.get(net.patterns[leg.pattern].route);
  const r = route ? file.routes[route.code] : undefined;
  if (!r) return UNKNOWN();
  const approx = !file.operators[r.op]?.confirmed;
  const make = (x: FarePoint | undefined, exact: boolean): Price => {
    if (!x || x.none || (x.p == null && x.min == null)) return UNKNOWN(r.op);
    const min = x.p ?? x.min ?? 0;
    const max = x.p ?? x.max ?? min;
    return { kind: approx ? 'approx' : exact ? 'exact' : 'upTo', min, max, op: r.op };
  };
  if (r.flat) return make(r.flat, r.flat.exact || !approx);
  const board = net.stops[leg.board].code;
  const alight = net.stops[leg.alight].code;
  const town = new Set(r.town ?? []);
  const sb = r.stops?.[board];
  const sa = r.stops?.[alight];
  if (town.has(board) && town.has(alight)) return UNKNOWN(r.op);
  if (town.has(board)) return make(sa, !!sa?.exact);
  if (town.has(alight)) return make(sb, !!sb?.exact);
  // Nie z miasta i nie do miasta: górna granica = cena dalszego końca (decyzja 23.09.2026, pkt 4).
  if (!sb || !sa) return UNKNOWN(r.op);
  return make(valueOf(sb) >= valueOf(sa) ? sb : sa, false);
}

/** Cena całej podróży: suma przejazdów; najmniej pewny składnik decyduje o rodzaju. */
export function journeyPrice(prices: Price[]): Price {
  if (!prices.length || prices.some((p) => p.kind === 'unknown')) return UNKNOWN();
  const kind = prices.some((p) => p.kind === 'approx') ? 'approx' : prices.some((p) => p.kind === 'upTo') ? 'upTo' : 'exact';
  return {
    kind,
    min: Math.round(prices.reduce((s, p) => s + p.min, 0) * 100) / 100,
    max: Math.round(prices.reduce((s, p) => s + p.max, 0) * 100) / 100,
    op: [...new Set(prices.map((p) => p.op))].join('+'),
  };
}

export function tripPrices(file: FareFile, net: Net, legs: RideLeg[]): { rides: Price[]; total: Price } {
  const rides = legs.map((l) => ridePrice(file, net, l));
  return { rides, total: journeyPrice(rides) };
}
