// Współrzędne z linku Google Maps (albo z wklejonych liczb) – do zgłoszeń poprawek położenia przystanków.
// Czysty TypeScript (test: scripts/test-maps-link.ts).

export type Coords = { lat: number; lon: number };

const ok = (lat: number, lon: number): Coords | null =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) ? { lat, lon } : null;

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const SEP = '\\s*(?:,|%2C|\\+)\\s*';

/**
 * Kolejność ma znaczenie: pinezka miejsca (!3d…!4d…) jest dokładniejsza niż środek widoku mapy (@lat,lon).
 * Obsługujemy: /place/…!3dLAT!4dLON, ?q= / query= / ll= / destination= / center=, /@LAT,LON, geo:LAT,LON, „LAT, LON”.
 */
export function parseCoords(input: string): Coords | null {
  const text = input.trim();
  if (!text) return null;
  let s = text;
  try {
    s = decodeURIComponent(text);
  } catch {
    // zostaje tekst oryginalny
  }
  const pin = [...s.matchAll(new RegExp(`!3d${NUM}!4d${NUM}`, 'g'))].pop();
  if (pin) return ok(+pin[1], +pin[2]);
  const param = s.match(new RegExp(`[?&](?:q|query|ll|destination|daddr|center|sll)=(?:loc:)?${NUM}${SEP}${NUM}`));
  if (param) return ok(+param[1], +param[2]);
  const at = s.match(new RegExp(`/@${NUM},${NUM}`));
  if (at) return ok(+at[1], +at[2]);
  const geo = s.match(new RegExp(`^geo:${NUM},${NUM}`));
  if (geo) return ok(+geo[1], +geo[2]);
  const plain = s.match(new RegExp(`^${NUM}°?\\s*[NS]?\\s*[,;\\s]\\s*${NUM}°?\\s*[EW]?$`));
  if (plain) return ok(+plain[1], +plain[2]);
  return null;
}

/** Krótki link z przycisku „Udostępnij” (trzeba go rozwinąć przez internet). */
export function isShortMapsLink(input: string): boolean {
  return /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(input.trim());
}

/** Rozwija krótki link (przekierowania) i szuka współrzędnych w adresie docelowym, a w razie potrzeby w treści strony. */
export async function resolveMapsLink(input: string, fetcher: typeof fetch = fetch): Promise<Coords | null> {
  const direct = parseCoords(input);
  if (direct) return direct;
  const url = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const res = await fetcher(url, { redirect: 'follow' });
  const finalUrl = res.url || url;
  const fromUrl = parseCoords(finalUrl);
  if (fromUrl) return fromUrl;
  // Strona zgody Google (UE): właściwy adres jest w parametrze „continue”.
  const cont = finalUrl.match(/[?&]continue=([^&]+)/);
  if (cont) {
    const c = parseCoords(decodeURIComponent(cont[1]));
    if (c) return c;
  }
  return coordsFromHtml(await res.text().catch(() => ''));
}

/** Pierwszy adres internetowy w tekście (udostępnienie bywa w stylu „Zobacz: Hotel X https://…”). */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,;]+$/, '') : null;
}

/** Współrzędne z treści strony: Google Maps, Booking (data-atlas-latlng), schema.org „geo”, meta place:location. */
export function coordsFromHtml(body: string): Coords | null {
  const patterns = [
    new RegExp(`!3d${NUM}!4d${NUM}`),
    /data-atlas-latlng="(-?\d+\.\d+),(-?\d+\.\d+)"/,
    /"latitude"\s*:\s*"?(-?\d+\.\d+)"?\s*,\s*"longitude"\s*:\s*"?(-?\d+\.\d+)/,
    /place:location:latitude"\s+content="(-?\d+\.\d+)"[\s\S]{0,300}?place:location:longitude"\s+content="(-?\d+\.\d+)"/,
    new RegExp(`/@${NUM},${NUM}`),
    /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    const c = m ? ok(+m[1], +m[2]) : null;
    if (c) return c;
  }
  return null;
}

/**
 * Punkt z wklejonego albo udostępnionego tekstu: współrzędne, link Google Maps (także krótki), Booking i inne strony
 * z mapą obiektu. null – nic nie znaleźliśmy (albo brak internetu przy linku, który trzeba otworzyć).
 */
export async function resolveSharedText(text: string, fetcher: typeof fetch = fetch): Promise<Coords | null> {
  const direct = parseCoords(text);
  if (direct) return direct;
  const url = firstUrl(text) ?? (isShortMapsLink(text) ? text.trim() : null);
  if (!url) return null;
  return parseCoords(url) ?? resolveMapsLink(url, fetcher);
}

/** Czy tekst wygląda na link albo współrzędne (wtedy wyszukiwarka proponuje „punkt z linku”). */
export const looksLikeLinkOrCoords = (text: string) => !!parseCoords(text) || !!firstUrl(text) || isShortMapsLink(text);
