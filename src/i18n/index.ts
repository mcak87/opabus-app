// Proste tłumaczenia: t('klucz', { zmienna }). Języki bez przetłumaczonego klucza dostają angielski.
// Hebrajski: układ od prawej do lewej (I18nManager) – telefon stosuje go dopiero po ponownym uruchomieniu aplikacji.
import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';

import { da } from './da';
import { de } from './de';
import { el } from './el';
import { en } from './en';
import { fi } from './fi';
import { he } from './he';
import { it } from './it';
import { no } from './no';
import { pl } from './pl';
import { sv } from './sv';
import { tr } from './tr';
import { uk } from './uk';

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

// Tłumaczenia poza PL i EN: z 03.10.2026, do sprawdzenia przez native speakerów (scripts/test-i18n.ts – komplet i zmienne).
const DICTS: Partial<Record<Lang, Partial<Record<Key, string>>>> = { pl, en, uk, el, de, tr, it, he, sv, no, da, fi };
const K_LANG = 'settings.lang';

function detect(): Lang {
  const saved = Storage.getItemSync(K_LANG);
  if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang;
  const device = getLocales()[0]?.languageCode ?? 'en';
  const code = device === 'nb' || device === 'nn' ? 'no' : device === 'iw' ? 'he' : device;
  return (LANGS.find((l) => l.code === code)?.code ?? 'en') as Lang;
}

let current: Lang = detect();
const listeners = new Set<() => void>();

/** Kierunek układu zgodny z językiem (hebrajski – od prawej). Zmiana działa od następnego uruchomienia. */
function syncRtl() {
  const rtl = current === 'he';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}
syncRtl();

/** Wybrano hebrajski (albo z niego zrezygnowano), a układ ekranu jeszcze się nie odwrócił – trzeba uruchomić ponownie. */
export function rtlRestartNeeded(): boolean {
  return I18nManager.isRTL !== (current === 'he');
}

/** Strzałka „do” w tekstach (A → B); w układzie od prawej – w drugą stronę. */
export const arrow = () => (I18nManager.isRTL ? '←' : '→');

/** Wielkie litery do nagłówków sekcji; greckie bez akcentów („ΣΤΟ ΚΙΝΗΤΟ”, nie „ΚΙΝΗΤΌ”) – tak pisze się po grecku.
 *  Po turecku „i” → „İ” (z kropką; „ı” → „I” robi już toUpperCase) – bez polegania na toLocaleUpperCase w Hermesie. */
export const upper = (s: string) =>
  (current === 'tr' ? s.replace(/i/g, 'İ') : s).toUpperCase().normalize('NFD').replace(/([Ͱ-Ͽ])́/g, '$1').normalize('NFC');

/** Przecinek dziesiętny („2,50 €”, „1,5 km”) – poza angielskim i hebrajskim. */
export const decimal = (s: string) => (current === 'en' || current === 'he' ? s : s.replace('.', ','));

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  Storage.setItemSync(K_LANG, lang);
  syncRtl();
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

/**
 * Klucz z odmianą przez liczbę: `base_one`, `base_few` (pl, uk: 2–4, 22–24…), `base` (pozostałe).
 * Po ukraińsku „один” także 21, 31… (21 зупинка), po polsku tylko 1.
 */
export function pluralKey(base: Key, n: number): Key {
  const slavic = current === 'pl' || current === 'uk';
  const one = current === 'uk' ? n % 10 === 1 && n % 100 !== 11 : n === 1;
  const few = slavic && n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  const k = `${base}${one ? '_one' : few ? '_few' : ''}`;
  return k in pl ? (k as Key) : base;
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
