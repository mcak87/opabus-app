// Wyszukiwanie w miejscach z OpenStreetMap – czysty TypeScript (test na prawdziwych plikach: scripts/test-places.ts).
import { distanceM, type LatLon } from '../lib/geo.ts';
import { fold, isGreek, matchesWords, translitGreek, words } from '../lib/searchNorm.ts';

/** h nocleg · b plaża · s zabytek · w kościół · e szkoła · m szpital · t port/lotnisko · f jedzenie · p sklep · v miejscowość · r ulica · a adres */
export type PlaceCat = 'h' | 'b' | 's' | 'w' | 'e' | 'm' | 't' | 'f' | 'p' | 'v' | 'r' | 'a';
export type PlaceHit = { region: string; cat: PlaceCat; lat: number; lon: number; name: string; latin: string; dist: number | null };

/** nums – adresy (kat. a): numery domów z przesunięciem od środka ulicy [numer, Δlat, Δlon] w 1e-5°. */
export type PlaceItem = { cat: PlaceCat; la: number; lo: number; name: string; latin: string; words: string[]; nums?: [string, number, number][] };
export type RawItem = [PlaceCat, number, number, string, (string | null)?, [string, number, number][]?];

export function prepareItems(raw: RawItem[]): PlaceItem[] {
  return raw.map(([cat, la, lo, name, latin, nums]) => {
    const lat2 = latin || (isGreek(name) ? translitGreek(name) : name);
    return { cat, la, lo, name, latin: lat2, words: [...new Set([...words(name), ...words(lat2)])], ...(nums ? { nums } : {}) };
  });
}

/**
 * Wyrazy pospolite w językach aplikacji → jak nazywa to OpenStreetMap (po angielsku albo po grecku). „Stare Miasto”
 * znajduje „Medieval city of Rhodes”, „lotnisko” – „Rhodes International Airport”. Grupa = to samo znaczenie;
 * `cats` – w jakich rodzajach miejsc szukać odpowiedników („lotnisko” to lotnisko, a nie ulica „…Airport” ani kawiarnia).
 */
const SYNONYMS: { cats: PlaceCat[]; group: string[][] }[] = [
  { cats: ['v', 's'], group: ['stare miasto', 'old town', 'old city', 'medieval city', 'medieval town', 'palia poli', 'mesaioniki poli',
    'altstadt', 'citta vecchia', 'centro storico', 'eski sehir', 'gamla stan', 'gamlebyen', 'gamle by', 'vanha kaupunki'] },
  // bez „aerodromio” – tak nazywają się też ulice „…Aerodromio”
  { cats: ['t'], group: ['lotnisko', 'airport', 'aerolimenas', 'flughafen', 'aeroporto', 'havalimani', 'lentoasema', 'lufthavn', 'flygplats'] },
  { cats: ['b'], group: ['plaza', 'beach', 'paralia', 'strand', 'spiaggia', 'plaj', 'uimaranta'] },
  { cats: ['t'], group: ['port', 'harbour', 'harbor', 'limani', 'hafen', 'liman', 'satama', 'havn', 'hamn'] },
  { cats: ['s'], group: ['zamek', 'castle', 'kastro', 'burg', 'castello', 'linna'] },
  { cats: ['s', 'w'], group: ['klasztor', 'monastery', 'moni', 'kloster', 'monastero', 'manastir', 'luostari'] },
].map(({ cats, group }) => ({ cats: cats as PlaceCat[], group: group.map(words) }));

export type QueryVariant = { words: string[]; cats: PlaceCat[] | null };

/**
 * Zapytanie i jego odpowiedniki: fraza z SYNONYMS (ostatnie słowo może być niedokończone) zamieniona na pozostałe
 * z grupy. Pierwsze – zapytanie bez zmian, szukane we wszystkich rodzajach miejsc (cats = null).
 */
export function queryVariants(q: string[]): QueryVariant[] {
  const out = new Map<string, QueryVariant>([[q.join(' '), { words: q, cats: null }]]);
  for (const { cats, group } of SYNONYMS) {
    for (const phrase of group) {
      for (let i = 0; i + phrase.length <= q.length; i++) {
        const part = q.slice(i, i + phrase.length);
        const hit = part.join('').length >= 4 && part.every((w, j) => (j < phrase.length - 1 ? w === phrase[j] : phrase[j].startsWith(w)));
        if (!hit) continue;
        for (const alt of group) {
          const v = [...q.slice(0, i), ...alt, ...q.slice(i + phrase.length)];
          const key = v.join(' ');
          if (!out.has(key)) out.set(key, { words: v, cats });
        }
      }
    }
  }
  return [...out.values()];
}

/** Ważność rodzaju miejsca w wynikach (miejscowość i hotel przed ulicą, ulica przed knajpą). */
const WEIGHT: Record<PlaceCat, number> = { v: 30, h: 26, b: 26, s: 24, t: 24, e: 20, m: 20, w: 14, p: 14, r: 12, a: 10, f: 8 };

/** `near` – bliższe wyżej. „Ermou 12”: słowa szukają ulicy, liczba – numeru domu (tylko w adresach). */
export function searchItems(byRegion: [string, PlaceItem[]][], query: string, near: LatLon | null, limit = 12): PlaceHit[] {
  const q = words(query);
  if (!q.length || q.join('').length < 2) return [];
  const whole = fold(query);
  const num = q.find((w) => /\d/.test(w));
  const textQ = q.filter((w) => !/\d/.test(w));
  const variants = queryVariants(q);
  const hits: (PlaceHit & { score: number })[] = [];
  const push = (region: string, it: PlaceItem, la: number, lo: number, suffix: string, bonus: number) => {
    const lat = la / 1e5;
    const lon = lo / 1e5;
    const dist = near ? distanceM(near.lat, near.lon, lat, lon) : null;
    const starts = fold(it.latin).startsWith(whole) || fold(it.name).startsWith(whole);
    const score = WEIGHT[it.cat] + bonus + (starts ? 25 : 0) - (dist !== null ? Math.min(30, dist / 1000) : 0);
    hits.push({ region, cat: it.cat, lat, lon, name: it.name + suffix, latin: it.latin + suffix, dist, score });
  };
  for (const [region, items] of byRegion) {
    for (const it of items) {
      if (it.nums) {
        if (!num || !textQ.length || !matchesWords(it.words, textQ)) continue;
        const n = it.nums.find(([x]) => fold(x) === num) ?? it.nums.find(([x]) => fold(x).startsWith(num));
        if (n) push(region, it, it.la + n[1], it.lo + n[2], ` ${n[0]}`, 30);
        continue;
      }
      if (variants.some((v) => (!v.cats || v.cats.includes(it.cat)) && matchesWords(it.words, v.words))) push(region, it, it.la, it.lo, '', 0);
    }
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...h }) => h);
}
