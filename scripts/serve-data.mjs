// Serwer danych na czas budowy aplikacji: udostępnia w sieci Wi-Fi to samo, co strona opublikuje pod
// https://opabus.com/data/v1/ (paczki offline, lista regionów, ustawienia). Bez zależności – tylko Node 24.
//   npm run dane            → folder domyślny (strona-opabus w projekcie OpaBus)
//   npm run dane -- <folder strona-opabus>
import { Buffer } from 'node:buffer';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_SITE = 'C:/Users/cizio/OneDrive/Desktop/Apliakcja Publiczny transport/strona-opabus';
const SITE = resolve(process.argv[2] || process.env.OPABUS_SITE || DEFAULT_SITE);
const ROOT = join(SITE, 'public');
const PORT = Number(process.env.PORT || 8787);

// .gz wysyłamy jako zwykły plik binarny (bez Content-Encoding) – aplikacja sprawdza sha256 skompresowanego pliku.
const TYPES = { '.json': 'application/json; charset=utf-8', '.gz': 'application/octet-stream' };

// Pliki, które na stronie generuje Astro (src/pages/data/v1/*.json.ts) – tutaj składamy je sami.
const DYNAMIC = {
  '/data/v1/regions.json': async () => {
    const { GROUPS } = await import(pathToFileURL(join(SITE, 'src', 'data', 'regions.ts')).href);
    return { version: 1, updated: new Date().toISOString(), groups: GROUPS };
  },
  // Do testów komunikatu i prośby o aktualizację: scripts/dev-app-config.json (poza gitem) nadpisuje te wartości.
  '/data/v1/app-config.json': async () => {
    const own = join(import.meta.dirname, 'dev-app-config.json');
    const base = { version: 1, minVersion: { android: '0.0.0', ios: '0.0.0' }, notice: null };
    return existsSync(own) ? { ...base, ...JSON.parse(readFileSync(own, 'utf8')) } : base;
  },
  // Jak src/pages/data/v1/news.json.ts na stronie: wpisy z src/content/news/<język>/*.md (bez draft i plików „_”).
  '/data/v1/news.json': async () => {
    const base = join(SITE, 'src', 'content', 'news');
    const ROUTE = { pl: 'aktualnosci', en: 'news', el: 'nea' };
    const items = [];
    for (const lang of readdirSync(base)) {
      for (const f of readdirSync(join(base, lang))) {
        if (!f.endsWith('.md') || f.startsWith('_')) continue;
        const head = readFileSync(join(base, lang, f), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
        const fm = Object.fromEntries(
          head
            .split(/\r?\n/)
            .map((l) => l.match(/^(\w+):\s*(.*)$/))
            .filter(Boolean)
            .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]),
        );
        if (fm.draft === 'true') continue;
        const slug = f.replace(/\.md$/, '');
        const l = fm.lang ?? lang;
        items.push({ id: `${lang}/${slug}`, key: fm.key, lang: l, title: fm.title, summary: fm.description, date: fm.date, region: fm.region ?? null, url: `https://opabus.com/${l}/${ROUTE[l]}/${slug}/` });
      }
    }
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { version: 1, items };
  },
};

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// Zdjęcia przystanków na czas testów: zapis w scripts/dev-photos (poza gitem). Tu od razu „zatwierdzone”,
// żeby w aplikacji było widać wyświetlanie – na stronie zdjęcie czeka na zatwierdzenie w /admin/zdjecia.
const PHOTOS = join(import.meta.dirname, 'dev-photos');
function devPhotos(region) {
  if (!existsSync(PHOTOS)) return [];
  return readdirSync(PHOTOS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(PHOTOS, f), 'utf8')))
    .filter((p) => p.region === region)
    .map(({ id, station, stops, w, h, caption, created }) => ({ id, station, stops, w, h, caption, created }));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST' && url.pathname === '/api/stop-photo') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const b = JSON.parse(body);
    const id = Math.random().toString(36).slice(2, 14).padEnd(12, 'x');
    mkdirSync(PHOTOS, { recursive: true });
    writeFileSync(join(PHOTOS, `${id}.jpg`), Buffer.from(b.image, 'base64'));
    const { image, ...meta } = b;
    writeFileSync(join(PHOTOS, `${id}.json`), JSON.stringify({ ...meta, id, created: new Date().toISOString(), status: 'approved' }));
    log('POST', url.pathname, JSON.stringify({ ...meta, image: `${Math.round(image.length * 0.75 / 1000)} KB` }));
    res.writeHead(201, { 'Content-Type': TYPES['.json'] }).end(JSON.stringify({ id, status: 'new' }));
    return;
  }
  if (url.pathname === '/api/stop-photos') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'] }).end(JSON.stringify({ version: 1, photos: devPhotos(url.searchParams.get('region')) }));
    log('GET', url.pathname + url.search);
    return;
  }
  if (url.pathname.startsWith('/api/stop-photo-img/')) {
    const f = join(PHOTOS, `${url.pathname.split('/').pop().replace(/[^a-z0-9]/g, '')}.jpg`);
    if (!existsSync(f)) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    createReadStream(f).pipe(res);
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    log('POST', url.pathname, body.slice(0, 4000));
    res.writeHead(204).end();
    return;
  }

  if (DYNAMIC[url.pathname]) {
    try {
      const json = JSON.stringify(await DYNAMIC[url.pathname]());
      res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' }).end(json);
      log('GET', url.pathname);
    } catch (e) {
      res.writeHead(500).end(String(e));
      log('GET', url.pathname, 'BŁĄD', e.message);
    }
    return;
  }

  const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404).end('not found');
    log('GET', url.pathname, '404');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
    'Content-Length': statSync(path).size,
    'Cache-Control': 'no-cache',
  });
  createReadStream(path).pipe(res);
  log('GET', url.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log(`Dane OpaBus z: ${ROOT}`);
  for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
  console.log('Aplikacja w trybie testowym znajdzie ten serwer sama. Uruchom ją: npm start');
});
