// Referrer instalacji z Google Play – czysty TypeScript (test: scripts/test-referrer.ts).
// Format z linku na stronie /s/…: utm_source=qr&utm_medium=partner|stop&utm_campaign=<kod>&region=<region>&stop=<przystanek>.

export function parseReferrer(s: string): Record<string, string> {
  const dec = (x: string) => {
    try {
      return decodeURIComponent(x.replace(/\+/g, ' '));
    } catch {
      return x;
    }
  };
  // Czasem referrer przychodzi jeszcze zakodowany w całości (utm_source%3Dqr%26…).
  if (!s.includes('=') && /%3D/i.test(s)) s = dec(s);
  const out: Record<string, string> = {};
  for (const part of s.split('&')) {
    const i = part.indexOf('=');
    if (i > 0) out[dec(part.slice(0, i))] = dec(part.slice(i + 1));
  }
  return out;
}

/** Co zrobić z referrerem: kod do statystyk (null = instalacja nie z kodu QR) i ekran do otwarcia. */
export function referrerTarget(ref: string): { hit: string | null; path: string | null } {
  const p = parseReferrer(ref);
  if (p.utm_source !== 'qr') return { hit: null, path: null };
  const hit = p.utm_campaign && /^[a-z0-9]{4,12}$/.test(p.utm_campaign) ? p.utm_campaign : '_';
  const region = p.region && /^[a-z0-9_]{2,40}$/.test(p.region) ? p.region : null;
  const stop = p.stop && p.stop.length <= 80 ? p.stop : null;
  return { hit, path: region && stop ? `/s/${region}/${encodeURIComponent(stop)}?src=install` : null };
}
