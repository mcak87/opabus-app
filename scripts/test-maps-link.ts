// Test odczytu współrzędnych z linków Google Maps:  node scripts/test-maps-link.ts
import { isShortMapsLink, parseCoords } from '../src/lib/mapsLink.ts';

const cases: [string, [number, number] | null][] = [
  ['https://www.google.com/maps/place/Faliraki/@36.3399,28.2011,17z/data=!3m1!4b1!4m6!3m5!1s0x14956b:0x9!8m2!3d36.340612!4d28.200634!16s%2Fg%2F11', [36.340612, 28.200634]],
  ['https://www.google.com/maps/@36.3406,28.2006,18z', [36.3406, 28.2006]],
  ['https://maps.google.com/?q=36.0917,28.0856', [36.0917, 28.0856]],
  ['https://www.google.com/maps/search/?api=1&query=36.0917%2C28.0856', [36.0917, 28.0856]],
  ['https://www.google.com/maps/dir/?api=1&destination=36.1,28.08', [36.1, 28.08]],
  ['geo:36.3406,28.2006?q=bus', [36.3406, 28.2006]],
  ['36.3406, 28.2006', [36.3406, 28.2006]],
  ['36.3406 28.2006', [36.3406, 28.2006]],
  ['https://www.google.com/maps/place/Lindos', null],
  ['coś innego', null],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = parseCoords(input);
  const pass = want === null ? got === null : !!got && Math.abs(got.lat - want[0]) < 1e-9 && Math.abs(got.lon - want[1]) < 1e-9;
  if (!pass) fail++;
  console.log(pass ? 'OK  ' : 'BŁĄD', input.slice(0, 70), '→', got);
}
console.log('krótki link:', isShortMapsLink('https://maps.app.goo.gl/AbCdEf123'), isShortMapsLink('https://www.google.com/maps/@1,2'));
process.exitCode = fail ? 1 : 0;
