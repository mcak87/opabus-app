// Planer w aplikacji: sieć regionu (raz na wersję paczki), wybór regionu dla punktów A i B, wywołanie plan().
import { OVERLAY_REGIONS } from '@/data/DataContext';
import { listInstalled, openRegion, type PackageInfo } from '@/data/packages';
import { inBbox, type LatLon } from '@/lib/geo';
import { addDays, athensNow } from '@/lib/time';

import { lastBack, plan } from './plan';
import { dayTrips, loadNet, type Journey, type Net } from './raptor';
import type { When } from './store';

const nets = new Map<string, { version: string; net: Promise<Net> }>();

export function netFor(region: string): Promise<Net> {
  const version = listInstalled()[region]?.version ?? '';
  const cached = nets.get(region);
  if (cached && cached.version === version) return cached.net;
  const net = openRegion(region).then(({ db }) => loadNet(db));
  nets.set(region, { version, net });
  net.catch(() => nets.delete(region));
  return net;
}

/** Region z pobranych, który obejmuje oba punkty (najmniejszy). */
export function regionFor(packages: PackageInfo[], a: LatLon, b: LatLon): string | null {
  const installed = listInstalled();
  const fit = packages
    .filter((p) => installed[p.region] && !OVERLAY_REGIONS.has(p.region) && inBbox(a, p.bbox) && inBbox(b, p.bbox))
    .sort((x, y) => (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]) - (y.bbox[2] - y.bbox[0]) * (y.bbox[3] - y.bbox[1]));
  return fit[0]?.region ?? null;
}

export async function planTrip(region: string, from: LatLon, to: LatLon, when: When, time: number) {
  const [net, { cal }] = await Promise.all([netFor(region), openRegion(region)]);
  const now = athensNow();
  const day = when === 'tomorrow' ? addDays(now, 1) : now;
  const prev = when === 'tomorrow' ? now : now.prev;
  const at = when === 'now' ? now.sec : time;
  // Oddajemy ekranowi chwilę na narysowanie wskaźnika ładowania, zanim policzymy trasę.
  await new Promise((r) => setTimeout(r, 30));
  return { net, at, result: plan(net, cal, { from, to, day, prev, at }) };
}

/**
 * Ostatni powrót dziś z punktu `from` do `to` (np. do noclegu): najpóźniejszy odjazd, który jeszcze dowiezie na miejsce.
 * Przystanki do 800 m, a gdy tam nic – do 1,5 km (jak w planerze). null = dziś autobusem już się nie da.
 */
export async function lastReturn(region: string, from: LatLon, to: LatLon): Promise<{ net: Net; journey: Journey | null }> {
  const [net, { cal }] = await Promise.all([netFor(region), openRegion(region)]);
  const now = athensNow();
  await new Promise((r) => setTimeout(r, 30));
  const trips = dayTrips(net, cal, now, now.prev);
  return { net, journey: lastBack(net, trips, from, to, now.sec, 800) ?? lastBack(net, trips, from, to, now.sec, 1500) };
}
