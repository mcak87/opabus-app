// Test odczytu referrera instalacji z kodu QR:  node scripts/test-referrer.ts
import { referrerTarget } from '../src/lib/referrer.ts';

type Want = { hit: string | null; path: string | null };
const cases: [string, Want][] = [
  // tak jak buduje go strona /s/… (src/pages/s/index.astro)
  ['utm_source=qr&utm_medium=partner&utm_campaign=ab12cd&region=rodos&stop=1234', { hit: 'ab12cd', path: '/s/rodos/1234?src=install' }],
  ['utm_source=qr&utm_medium=stop&region=ateny&stop=ATH_OSY_10341', { hit: '_', path: '/s/ateny/ATH_OSY_10341?src=install' }],
  ['utm_source%3Dqr%26utm_medium%3Dpartner%26utm_campaign%3Dab12cd%26region%3Drodos%26stop%3D1234', { hit: 'ab12cd', path: '/s/rodos/1234?src=install' }],
  ['utm_source=qr&utm_medium=partner&utm_campaign=ab12cd', { hit: 'ab12cd', path: null }],
  ['utm_source=qr&utm_campaign=..%2F..%2Fx&region=..%2Fx&stop=1', { hit: '_', path: null }],
  ['utm_source=qr&region=saloniki&stop=THE%20METRO', { hit: '_', path: '/s/saloniki/THE%20METRO?src=install' }],
  // instalacje nie z kodu QR – nic nie liczymy i nic nie otwieramy
  ['utm_source=google-play&utm_medium=organic', { hit: null, path: null }],
  ['utm_source=opabus.com&utm_medium=web', { hit: null, path: null }],
  ['', { hit: null, path: null }],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = referrerTarget(input);
  const pass = got.hit === want.hit && got.path === want.path;
  if (!pass) fail++;
  console.log(pass ? 'OK  ' : 'BŁĄD', input, '→', JSON.stringify(got));
}
console.log(fail ? `${fail} błędów` : 'Wszystko OK');
process.exit(fail ? 1 : 0);
