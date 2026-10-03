// Strony opabus.com otwierane z aplikacji (współpraca, plakat dla hoteli, aktualności) – w języku aplikacji
// (strona ma PL, EN i EL; reszta języków dostaje angielską) i w przeglądarce wewnątrz aplikacji.
// Decyzja z 25.09.2026: współpraca to gotowe strony opabus.com, bez osobnych formularzy w aplikacji.
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { C } from '@/constants/theme';
import { getLang } from '@/i18n';

export const SITE_URL = 'https://opabus.com';
export const PARTNERS_EMAIL = 'wspolpraca@opabus.com';

type SiteLang = 'pl' | 'en' | 'el';

// Jak ROUTES w strona-opabus/src/i18n/ui.ts.
const ROUTES = {
  partners: { pl: 'wspolpraca', en: 'partners', el: 'synergasia' },
  poster: { pl: 'wspolpraca/plakat', en: 'partners/poster', el: 'synergasia/afisa' },
  news: { pl: 'aktualnosci', en: 'news', el: 'nea' },
} as const;

export function siteLang(): SiteLang {
  const l = getLang();
  return l === 'pl' || l === 'el' ? l : 'en';
}

/**
 * Adres podstrony, np. sitePage('partners', { typ: 'zgloszenie', region: 'Rodos' }, 'formularz').
 * Zawsze z `src=app` – strona oznacza wtedy zgłoszenie jako wysłane z aplikacji.
 */
export function sitePage(page: keyof typeof ROUTES, params: Record<string, string | null | undefined> = {}, hash?: string): string {
  const lang = siteLang();
  const query = Object.entries({ ...params, src: 'app' })
    .filter((e): e is [string, string] => !!e[1])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${SITE_URL}/${lang}/${ROUTES[page][lang]}/?${query}${hash ? `#${hash}` : ''}`;
}

/** Otwiera stronę w przeglądarce w aplikacji (powrót jednym gestem); gdy się nie da – w zwykłej przeglądarce. */
export async function openSite(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, { toolbarColor: '#FFFFFF', controlsColor: C.blue, enableBarCollapsing: true, showTitle: true });
  } catch {
    await Linking.openURL(url).catch(() => {});
  }
}
