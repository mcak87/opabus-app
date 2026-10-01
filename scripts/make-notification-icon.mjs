// Ikona powiadomień Androida: biały autobus (jak ikona „bus” w aplikacji) na przezroczystym tle, 96×96 px.
// Android barwi ją sam (kolor z app.json → expo-notifications). Uruchomienie: node scripts/make-notification-icon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 96;
const SCALE = SIZE / 24; // rysunek w siatce 24×24 jak ikony aplikacji
const SS = 4; // wygładzanie krawędzi (4×4 próbki na piksel)

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// Kształt w jednostkach 24×24: nadwozie, koła; wycięte szyba i reflektory.
const filled = (x, y) =>
  (inRoundRect(x, y, 4, 2.5, 20, 18.5, 3.2) &&
    !inRoundRect(x, y, 6.3, 5, 17.7, 10.8, 1.6) &&
    !inCircle(x, y, 8.2, 14.6, 1.25) &&
    !inCircle(x, y, 15.8, 14.6, 1.25)) ||
  inRoundRect(x, y, 6, 17.5, 9.5, 21.5, 1.2) ||
  inRoundRect(x, y, 14.5, 17.5, 18, 21.5, 1.2);

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0; // filtr PNG: brak
  for (let px = 0; px < SIZE; px++) {
    let hit = 0;
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) if (filled((px + (sx + 0.5) / SS) / SCALE, (py + (sy + 0.5) / SS) / SCALE)) hit++;
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    raw[o] = raw[o + 1] = raw[o + 2] = 255;
    raw[o + 3] = Math.round((255 * hit) / (SS * SS));
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // 8 bitów na kanał
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = new URL('../assets/images/notification-icon.png', import.meta.url);
writeFileSync(out, png);
console.log('Zapisano', out.pathname, png.length, 'B');
