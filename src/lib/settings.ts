// Ustawienia i ulubione przystanki – tylko w tym telefonie (bez konta). Klucze mają wersję (.v1),
// żeby dane zapisane przez starszą wersję aplikacji nie psuły nowej.
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

const K_ONBOARDED = 'settings.onboarded.v1';
const K_HOME = 'settings.homeRegion.v1';
const K_FAVS = 'favorites.v1';

export type Favorite = { region: string; station: number; name: string; name_en: string };

export type Settings = {
  /** Ekran powitalny (język → lokalizacja → region) już przejdzie. */
  onboarded: boolean;
  /** Region wybrany ręcznie – dla ekranu Start bez lokalizacji. */
  homeRegion: string | null;
  favorites: Favorite[];
};

function readFavorites(): Favorite[] {
  try {
    const v: unknown = JSON.parse(Storage.getItemSync(K_FAVS) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((f): f is Favorite => !!f && typeof f.region === 'string' && typeof f.station === 'number');
  } catch {
    return [];
  }
}

let state: Settings = {
  onboarded: Storage.getItemSync(K_ONBOARDED) === '1',
  homeRegion: Storage.getItemSync(K_HOME),
  favorites: readFavorites(),
};
const listeners = new Set<() => void>();

function update(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return state;
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function setOnboarded(done = true) {
  Storage.setItemSync(K_ONBOARDED, done ? '1' : '0');
  update({ onboarded: done });
}

export function setHomeRegion(region: string | null) {
  if (region) Storage.setItemSync(K_HOME, region);
  else Storage.removeItemSync(K_HOME);
  update({ homeRegion: region });
}

const favKey = (region: string, station: number) => `${region}:${station}`;

export function isFavorite(favs: Favorite[], region: string, station: number): boolean {
  return favs.some((f) => favKey(f.region, f.station) === favKey(region, station));
}

export function toggleFavorite(fav: Favorite) {
  const key = favKey(fav.region, fav.station);
  const next = isFavorite(state.favorites, fav.region, fav.station)
    ? state.favorites.filter((f) => favKey(f.region, f.station) !== key)
    : [...state.favorites, fav];
  Storage.setItemSync(K_FAVS, JSON.stringify(next));
  update({ favorites: next });
}
