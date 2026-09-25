// Proste tłumaczenia: t('klucz', { zmienna }). Języki bez przetłumaczonego klucza dostają angielski.
import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { en } from './en';
import { pl } from './pl';

export type Key = keyof typeof pl;
export const LANGS = [
  { code: 'pl', name: 'Polski' },
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'de', name: 'Deutsch' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'it', name: 'Italiano' },
  { code: 'he', name: 'עברית' },
  { code: 'sv', name: 'Svenska' },
  { code: 'no', name: 'Norsk' },
  { code: 'da', name: 'Dansk' },
  { code: 'fi', name: 'Suomi' },
] as const;
export type Lang = (typeof LANGS)[number]['code'];

const DICTS: Partial<Record<Lang, Partial<Record<Key, string>>>> = { pl, en };
const K_LANG = 'settings.lang';

function detect(): Lang {
  const saved = Storage.getItemSync(K_LANG);
  if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang;
  const device = getLocales()[0]?.languageCode ?? 'en';
  const code = device === 'nb' || device === 'nn' ? 'no' : device;
  return (LANGS.find((l) => l.code === code)?.code ?? 'en') as Lang;
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  Storage.setItemSync(K_LANG, lang);
  listeners.forEach((l) => l());
}

export function hasTranslation(lang: Lang): boolean {
  return !!DICTS[lang];
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = DICTS[current]?.[key] ?? en[key] ?? pl[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Hook: ponowne renderowanie po zmianie języka. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
