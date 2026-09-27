// Stan planera (skąd, dokąd, kiedy, ostatni wynik) i ostatnio wyszukiwane cele – tylko w telefonie.
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import type { PlanResult } from './plan';
import type { Net } from './raptor';

export type Place =
  | { kind: 'me' }
  | { kind: 'station'; region: string; id: number; name: string; name_en: string; lat: number; lon: number }
  | { kind: 'point'; lat: number; lon: number; name: string; name_en: string };

export type When = 'now' | 'later' | 'tomorrow';

export type PlannedTrip = {
  region: string;
  net: Net;
  from: Place;
  to: Place;
  fromPoint: { lat: number; lon: number };
  toPoint: { lat: number; lon: number };
  result: PlanResult;
  /** Godzina, od której szukaliśmy (sekundy dnia wyniku). */
  at: number;
};

type State = { from: Place; to: Place | null; when: When; time: number; trip: PlannedTrip | null; recent: Place[] };

const K_RECENT = 'planner.recent.v1';

function readRecent(): Place[] {
  try {
    const v: unknown = JSON.parse(Storage.getItemSync(K_RECENT) ?? '[]');
    return Array.isArray(v) ? (v as Place[]).filter((p) => p && (p.kind === 'station' || p.kind === 'point')) : [];
  } catch {
    return [];
  }
}

let state: State = { from: { kind: 'me' }, to: null, when: 'now', time: 9 * 3600, trip: null, recent: readRecent() };
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePlanner(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function getPlanner(): State {
  return state;
}

export const setFrom = (from: Place) => update({ from });
export const setTo = (to: Place | null) => update({ to });
export const setWhen = (when: When, time?: number) => update({ when, time: time ?? state.time });
export const setTrip = (trip: PlannedTrip | null) => update({ trip });
export const swapPlaces = () => state.to && update({ from: state.to, to: state.from });

const samePlace = (a: Place, b: Place) =>
  a.kind === b.kind && (a.kind === 'station' ? b.kind === 'station' && a.region === b.region && a.id === b.id : a.kind === 'point' && b.kind === 'point' && a.lat === b.lat && a.lon === b.lon);

export function addRecent(p: Place) {
  if (p.kind === 'me') return;
  const recent = [p, ...state.recent.filter((r) => !samePlace(r, p))].slice(0, 6);
  Storage.setItemSync(K_RECENT, JSON.stringify(recent));
  update({ recent });
}
