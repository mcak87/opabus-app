// Zdalne ustawienia aplikacji ze strony (https://opabus.com/data/v1/app-config.json): minimalna wersja,
// komunikat na ekranie Start, linki do sklepów. Zapisane w telefonie – bez internetu działa ostatnia znana wersja.
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { Lang } from '@/i18n';

import { getJson } from './packages';

/** Komunikat w kilku językach: { id, pl, en, el, …, url? }. Nowe id = komunikat pokaże się znowu. */
export type Notice = { id: string; url?: string } & { [lang: string]: string | undefined };
export type AppConfig = {
  minVersion?: { android?: string; ios?: string };
  notice?: Notice | null;
  links?: { privacy?: string; partners?: string; report?: string };
  store?: { android?: string; ios?: string };
};

const K_CONFIG = 'appConfig.v1';
const K_DISMISSED = 'appConfig.dismissedNotices.v1';
const ANDROID_STORE = 'https://play.google.com/store/apps/details?id=com.opabus.app';

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = Storage.getItemSync(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

type State = { config: AppConfig; dismissed: string[]; updateSkipped: boolean };
let state: State = { config: readJson<AppConfig>(K_CONFIG, {}), dismissed: readJson<string[]>(K_DISMISSED, []), updateSkipped: false };
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useAppConfig(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export async function refreshAppConfig(): Promise<void> {
  const cfg = await getJson<AppConfig>('/data/v1/app-config.json');
  if (!cfg || typeof cfg !== 'object') return;
  Storage.setItemSync(K_CONFIG, JSON.stringify(cfg));
  update({ config: cfg });
}

/** -1, 0, 1 – porównanie wersji „1.2.10” liczbowo, część po części. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function needsUpdate(cfg: AppConfig): boolean {
  const min = cfg.minVersion?.[Platform.OS === 'ios' ? 'ios' : 'android'];
  return !!min && compareVersions(APP_VERSION, min) < 0;
}

/** Prośba o aktualizację nie wraca do następnego uruchomienia – rozkłady w telefonie działają dalej. */
export function skipUpdate() {
  update({ updateSkipped: true });
}

export function storeUrl(cfg: AppConfig): string {
  return Platform.OS === 'ios' ? cfg.store?.ios || 'itms-apps://apps.apple.com/' : cfg.store?.android || ANDROID_STORE;
}

export function activeNotice(s: State, lang: Lang): { id: string; text: string; url?: string } | null {
  const n = s.config.notice;
  if (!n?.id || s.dismissed.includes(n.id)) return null;
  const text = n[lang] || n.en || n.pl;
  if (!text) return null;
  return { id: n.id, text, url: n.url?.startsWith('https://') ? n.url : undefined };
}

export function dismissNotice(id: string) {
  const next = [...state.dismissed.filter((x) => x !== id), id].slice(-20);
  Storage.setItemSync(K_DISMISSED, JSON.stringify(next));
  update({ dismissed: next });
}
