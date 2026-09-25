// Serwer danych na czas budowy aplikacji: udostępnia w sieci Wi-Fi to samo, co strona opublikuje pod
// https://opabus.com/data/v1/ (paczki offline, lista regionów, ustawienia). Bez zależności – tylko Node 24.
//   npm run dane            → folder domyślny (strona-opabus w projekcie OpaBus)
//   npm run dane -- <folder strona-opabus>
import { createReadStream, existsSync, statSync } from 'node:fs';
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
  '/data/v1/app-config.json': async () => ({ version: 1, minVersion: { android: '0.0.0', ios: '0.0.0' }, notice: null }),
  '/data/v1/news.json': async () => ({ version: 1, items: [] }),
};

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    log('POST', url.pathname, body.slice(0, 200));
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
  for (const ip of ips) console.log(`  EXPO_PUBLIC_DATA_URL=http://${ip}:${PORT}`);
  console.log('Wpisz właściwy adres do pliku .env.local i uruchom aplikację: npm start');
});
