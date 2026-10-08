// Odznaki – reguły (Etap 1 programu nagród, decyzja Michała 08.10.2026): liczone tylko w telefonie, bez konta, punktów
// i rankingu. Wygląd i progi wg specyfikacji z Cowork (opabus-nagrody-spec.md, makieta „Poziomy i odznaki”).
// Ten plik nie zależy od React Native – testy: `node scripts/test-badges.ts`.

/** Licznik wkładu zapisany w telefonie. */
export type BadgeStats = {
  /** Zgłoszenia punktualności przyjęte przez serwer. */
  reports: number;
  /** Z nich: kursy od listopada do marca. */
  offSeason: number;
  /** Zdjęcia przystanków zatwierdzone przez OpaBus. */
  photos: number;
  /** Z nich: przystanek nie miał jeszcze żadnego zdjęcia, gdy zdjęcie było wysyłane. */
  firstPhotos: number;
  /** Poprawki położenia przystanków przyjęte przez serwer. */
  fixes: number;
  /** Regiony z co najmniej jednym wkładem. */
  regions: string[];
  /** Dni z wkładem (RRRRMMDD, czas w telefonie) – do serii; trzymamy ostatnie 130. */
  days: string[];
  /** Najdłuższa seria dni z rzędu. */
  bestStreak: number;
};

export const EMPTY_STATS: BadgeStats = { reports: 0, offSeason: 0, photos: 0, firstPhotos: 0, fixes: 0, regions: [], days: [], bestStreak: 0 };

export type BadgeCategory = 'schedule' | 'photo' | 'map' | 'community' | 'special';
export type BadgeId =
  | 'first_report'
  | 'punctual'
  | 'first_photo'
  | 'photographer'
  | 'explorer'
  | 'cartographer'
  | 'streak'
  | 'islander'
  | 'off_season';

export type BadgeDef = {
  id: BadgeId;
  category: BadgeCategory;
  /** Progi stopni I/II/III; jeden próg = odznaka jednorazowa. */
  tiers: number[];
  value: (s: BadgeStats) => number;
};

export const BADGES: BadgeDef[] = [
  { id: 'first_report', category: 'schedule', tiers: [1], value: (s) => s.reports },
  { id: 'punctual', category: 'schedule', tiers: [10, 50, 200], value: (s) => s.reports },
  { id: 'first_photo', category: 'photo', tiers: [1], value: (s) => s.photos },
  { id: 'photographer', category: 'photo', tiers: [5, 25, 100], value: (s) => s.photos },
  { id: 'explorer', category: 'photo', tiers: [1, 10, 50], value: (s) => s.firstPhotos },
  { id: 'cartographer', category: 'map', tiers: [3, 10, 30], value: (s) => s.fixes },
  { id: 'streak', category: 'community', tiers: [7, 30, 100], value: (s) => s.bestStreak },
  { id: 'islander', category: 'community', tiers: [3, 10, 25], value: (s) => s.regions.length },
  { id: 'off_season', category: 'special', tiers: [10, 50, 150], value: (s) => s.offSeason },
];

/** Zdobyty stopień: 0 – jeszcze nie, 1–3 (jednorazowa: 0/1). */
export function tierOf(def: BadgeDef, s: BadgeStats): number {
  const v = def.value(s);
  return def.tiers.filter((t) => v >= t).length;
}

/** Postęp do następnego stopnia (null, gdy zdobyty najwyższy). */
export function nextGoal(def: BadgeDef, s: BadgeStats): { have: number; need: number; tier: number } | null {
  const tier = tierOf(def, s);
  if (tier >= def.tiers.length) return null;
  return { have: def.value(s), need: def.tiers[tier], tier: tier + 1 };
}

/** Nowe stopnie po zmianie liczników (do okna „Nowa odznaka”), w kolejności definicji. */
export function newlyEarned(before: Record<string, number>, s: BadgeStats): { id: BadgeId; tier: number }[] {
  const out: { id: BadgeId; tier: number }[] = [];
  for (const def of BADGES) {
    const tier = tierOf(def, s);
    if (tier > (before[def.id] ?? 0)) out.push({ id: def.id, tier });
  }
  return out;
}

/** Kurs (data RRRR-MM-DD albo RRRRMMDD) wypada od listopada do marca. */
export function isOffSeason(date: string): boolean {
  const m = Number(date.replace(/-/g, '').slice(4, 6));
  return m >= 11 || m <= 3;
}

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export const todayKey = (now = new Date()) => ymd(now);

/** Najdłuższa seria kolejnych dni w posortowanej liście dni RRRRMMDD. */
export function longestRun(days: string[]): number {
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of [...new Set(days)].sort()) {
    const d = new Date(Number(k.slice(0, 4)), Number(k.slice(4, 6)) - 1, Number(k.slice(6, 8)));
    const next = prev ? new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1) : null;
    run = next && ymd(next) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Bieżąca seria – kończy się dziś albo wczoraj (dziś można jeszcze pomóc). */
export function currentRun(days: string[], now = new Date()): number {
  const set = new Set(days);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(ymd(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export type Contribution = { kind: 'report' | 'photoSent' | 'photoApproved' | 'fix'; region: string; date?: string; first?: boolean };

/** Nowe liczniki po wkładzie. Wysłane (jeszcze niezatwierdzone) zdjęcie liczy się tylko do serii dni. */
export function apply(s: BadgeStats, c: Contribution, now = new Date()): BadgeStats {
  const n: BadgeStats = { ...s, regions: [...s.regions], days: [...s.days] };
  if (c.kind === 'report') {
    n.reports++;
    if (c.date && isOffSeason(c.date)) n.offSeason++;
  } else if (c.kind === 'photoApproved') {
    n.photos++;
    if (c.first) n.firstPhotos++;
  } else if (c.kind === 'fix') {
    n.fixes++;
  }
  if (c.kind !== 'photoSent' && c.region && !n.regions.includes(c.region)) n.regions.push(c.region);
  if (c.kind !== 'photoApproved') {
    const k = todayKey(now);
    if (!n.days.includes(k)) n.days = [...n.days, k].sort().slice(-130);
    n.bestStreak = Math.max(n.bestStreak, longestRun(n.days));
  }
  return n;
}
