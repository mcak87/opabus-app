// Odznaki (Etap 1) – liczniki i zdobyte stopnie zapisane tylko w telefonie (bez konta, nic nie wysyłamy).
// Wkład zgłaszają moduły: punktualność (zgłoszenie przyjęte przez serwer), zdjęcia (wysłane / zatwierdzone),
// poprawki przystanków (przyjęte przez serwer). Nowy stopień trafia do kolejki okna „Nowa odznaka” (BadgeCelebration).
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { apply, BADGES, EMPTY_STATS, newlyEarned, type BadgeId, type BadgeStats, type Contribution } from '@/data/badgeRules';

const KEY = 'badges.v1';

export type Earned = { id: BadgeId; tier: number };
type State = { stats: BadgeStats; tiers: Record<string, number>; pending: Earned[] };

function load(): State {
  try {
    const v = Storage.getItemSync(KEY);
    if (v) {
      const s = JSON.parse(v) as Partial<State>;
      // Odznaki usunięte w nowszej wersji aplikacji nie blokują kolejki okna „Nowa odznaka”.
      const pending = (s.pending ?? []).filter((p) => BADGES.some((b) => b.id === p.id));
      return { stats: { ...EMPTY_STATS, ...s.stats }, tiers: s.tiers ?? {}, pending };
    }
  } catch {
    // uszkodzony zapis – zaczynamy od zera
  }
  return { stats: EMPTY_STATS, tiers: {}, pending: [] };
}

let state: State = load();
const listeners = new Set<() => void>();

function save(next: State) {
  state = next;
  try {
    Storage.setItemSync(KEY, JSON.stringify(state));
  } catch {
    // brak miejsca – liczniki zostaną w pamięci do zamknięcia aplikacji
  }
  listeners.forEach((l) => l());
}

/** Zapisuje wkład i dopisuje nowe stopnie odznak do kolejki okna „Nowa odznaka”. */
export function recordContribution(c: Contribution) {
  const stats = apply(state.stats, c);
  const gained = newlyEarned(state.tiers, stats);
  const tiers = { ...state.tiers };
  for (const g of gained) tiers[g.id] = g.tier;
  // Kilka stopni tej samej odznaki naraz (np. zaległe zatwierdzenia) – pokazujemy tylko najwyższy.
  const pending = [...state.pending.filter((p) => !gained.some((g) => g.id === p.id)), ...gained];
  save({ stats, tiers, pending });
}

/** Okno „Nowa odznaka” pokazało pierwszą z kolejki. */
export function shiftPending() {
  if (state.pending.length) save({ ...state, pending: state.pending.slice(1) });
}

export function useBadges(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
