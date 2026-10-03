// Sprawdza tłumaczenie względem polskiego: komplet kluczy, te same zmienne {…}, brak pustych tekstów.
//   node scripts/test-i18n.ts [kod języka …]   (bez argumentów – wszystkie pliki z src/i18n)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { pl } from '../src/i18n/pl.ts';

const dir = join(import.meta.dirname, '..', 'src', 'i18n');
const codes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir)
      .filter((f) => /^[a-z]{2}\.ts$/.test(f) && f !== 'pl.ts')
      .map((f) => f.slice(0, 2));

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
let failed = false;
for (const code of codes) {
  const mod = await import(pathToFileURL(join(dir, `${code}.ts`)).href);
  const dict = mod[code] as Record<string, string>;
  const errors: string[] = [];
  if (!dict) errors.push(`brak eksportu „${code}”`);
  else {
    for (const [k, v] of Object.entries(pl)) {
      const tr = dict[k];
      if (typeof tr !== 'string' || !tr.trim()) errors.push(`${k}: brak tekstu`);
      else if (vars(tr) !== vars(v)) errors.push(`${k}: zmienne {${vars(tr)}} zamiast {${vars(v)}}`);
    }
    for (const k of Object.keys(dict)) if (!(k in pl)) errors.push(`${k}: klucza nie ma w pl.ts`);
  }
  failed ||= errors.length > 0;
  console.log(`${errors.length ? 'BŁĘDY' : 'OK   '} ${code}${errors.length ? `\n  ${errors.join('\n  ')}` : ` (${Object.keys(pl).length} tekstów)`}`);
}
process.exit(failed ? 1 : 0);
