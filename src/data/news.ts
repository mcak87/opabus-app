// „Co nowego” – aktualności ze strony (https://opabus.com/data/v1/news.json, wpisy z src/content/news na stronie).
// Zapisane w telefonie – bez internetu widać ostatnio pobrane. Licznik „nowe” = wpisy, których jeszcze nie oglądano.
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { siteLang } from '@/lib/site';

import { getJson } from './packages';

/** Jeden wpis w jednym języku; `key` łączy tłumaczenia tego samego wpisu (PL, EN, EL). */
export type NewsItem = { id: string; key: string; lang: string; title: string; summary: string; date: string; region: string | null; url: string };

const K_NEWS = 'news.v1';
const K_SEEN = 'news.seen.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = Storage.getItemSync(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

type State = { items: NewsItem[]; seen: string[] };
let state: State = { items: readJson<NewsItem[]>(K_NEWS, []), seen: readJson<string[]>(K_SEEN, []) };
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const isItem = (x: unknown): x is NewsItem => {
  const i = x as NewsItem;
  return !!i && typeof i.id === 'string' && typeof i.title === 'string' && typeof i.date === 'string' && typeof i.url === 'string' && i.url.startsWith('https://');
};

export async function refreshNews(): Promise<void> {
  const r = await getJson<{ items?: unknown[] }>('/data/v1/news.json');
  if (!r || !Array.isArray(r.items)) return;
  const items = r.items.filter(isItem).map((i) => ({ ...i, key: i.key || i.id, summary: i.summary ?? '', region: i.region ?? null }));
  Storage.setItemSync(K_NEWS, JSON.stringify(items));
  update({ items });
}

/** Wpisy w języku aplikacji (gdy brak tłumaczenia – angielski, potem dowolny), od najnowszego. */
export function newsForLang(items: NewsItem[]): NewsItem[] {
  const lang = siteLang();
  const byKey = new Map<string, NewsItem>();
  const rank = (i: NewsItem) => (i.lang === lang ? 0 : i.lang === 'en' ? 1 : 2);
  for (const i of items) {
    const cur = byKey.get(i.key);
    if (!cur || rank(i) < rank(cur)) byKey.set(i.key, i);
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function useNews(): { items: NewsItem[]; unseen: number } {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
  const items = newsForLang(s.items);
  return { items, unseen: items.filter((i) => !s.seen.includes(i.key)).length };
}

/** Klucze wpisów już oglądanych (do oznaczenia „nowe” na liście przed markNewsSeen). */
export function seenNewsKeys(): string[] {
  return state.seen;
}

/** Po obejrzeniu listy wszystkie obecne wpisy przestają być „nowe”. */
export function markNewsSeen() {
  const keys = [...new Set(state.items.map((i) => i.key))];
  if (keys.every((k) => state.seen.includes(k))) return;
  const seen = [...new Set([...state.seen, ...keys])].slice(-200);
  Storage.setItemSync(K_SEEN, JSON.stringify(seen));
  update({ seen });
}
