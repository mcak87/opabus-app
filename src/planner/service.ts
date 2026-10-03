// Planer w aplikacji: sieć z pobranych paczek (raz na wersję), wybór paczek dla punktów A i B, wywołanie plan().
// Sieć łączy regiony startu i celu z paczkami całej Grecji (promy, kolej) – np. Faliraki → Symi: autobus + prom.
import { OVERLAY_REGIONS } from '@/data/DataContext';
import { listInstalled, openRegion, type PackageInfo } from '@/data/packages';
import { bboxArea, inBbox, type LatLon } from '@/lib/geo';
import { addDays, athensNow } from '@/lib/time';

import { lastBack, plan } from './plan';
import { dayTrips, loadNet, mergeNets, type Journey, type Net } from './raptor';
import type { When } from './store';

const nets = new Map<string, { version: string; net: Promise<Net> }>();

export function netFor(region: string): Promise<Net> {
  const version = listInstalled()[region]?.version ?? '';
  const cached = nets.get(region);
  if (cached && cached.version === version) return cached.net;
  const net = openRegion(region).then(({ db }) => loadNet(db, region));
  nets.set(region, { version, net });
  net.catch(() => nets.delete(region));
  return net;
}

/** Ostatnie sieci łączone (planer i powrót do noclegu – zwykle liczymy kilka razy z rzędu w tym samym miejscu). */
const merged = new Map<string, Promise<Net>>();
const MERGED_KEEP = 2;

/** Sieć z kilku paczek; największa paczka idzie pierwsza (mergeNets jej nie kopiuje). */
export function netForRegions(regions: string[]): Promise<Net> {
  const installed = listInstalled();
  const key = regions.map((r) => `${r}@${installed[r]?.version ?? ''}`).join(',');
  let net = merged.get(key);
  if (net) {
    merged.delete(key); // na koniec kolejki – najświeższa
  } else {
    net = Promise.all(regions.map(netFor)).then((parts) => mergeNets([...parts].sort((a, b) => b.stops.length - a.stops.length)));
    net.catch(() => merged.delete(key));
  }
  merged.set(key, net);
  while (merged.size > MERGED_KEEP) merged.delete(merged.keys().next().value!);
  return net;
}

/** Region z pobranych, który obejmuje oba punkty (najmniejszy). */
export function regionFor(packages: PackageInfo[], a: LatLon, b: LatLon): string | null {
  const installed = listInstalled();
  const fit = packages
    .filter((p) => installed[p.region] && !OVERLAY_REGIONS.has(p.region) && inBbox(a, p.bbox) && inBbox(b, p.bbox))
    .sort((x, y) => bboxArea(x.bbox) - bboxArea(y.bbox));
  return fit[0]?.region ?? null;
}

/**
 * Paczki do zaplanowania podróży A → B: pobrane regiony obejmujące A albo B + pobrane promy i kolej.
 * `missing` – czego brakuje w telefonie (najmniejszy region przy A i przy B, promy, kolej), żeby podpowiedzieć pobranie.
 * `primary` – region startu (nagłówek, panorama), a gdy start jest poza regionami – region celu.
 */
export function regionsFor(packages: PackageInfo[], a: LatLon, b: LatLon): { regions: string[]; primary: string | null; missing: PackageInfo[] } {
  const installed = listInstalled();
  const local = packages.filter((p) => !OVERLAY_REGIONS.has(p.region)).sort((x, y) => bboxArea(x.bbox) - bboxArea(y.bbox));
  const atA = local.filter((p) => inBbox(a, p.bbox));
  const atB = local.filter((p) => inBbox(b, p.bbox));
  const regions = [...new Set([...atA, ...atB].filter((p) => installed[p.region]).map((p) => p.region))];
  const overlays = packages.filter((p) => OVERLAY_REGIONS.has(p.region));
  regions.push(...overlays.filter((p) => installed[p.region]).map((p) => p.region));
  const missing = [
    ...[atA, atB].filter((list) => list.length && !list.some((p) => installed[p.region])).map((list) => list[0]),
    ...overlays.filter((p) => !installed[p.region]),
  ].filter((p, i, all) => all.findIndex((x) => x.region === p.region) === i);
  const primary = atA.find((p) => installed[p.region])?.region ?? atB.find((p) => installed[p.region])?.region ?? null;
  return { regions, primary, missing };
}

export async function planTrip(regions: string[], from: LatLon, to: LatLon, when: When, time: number) {
  const net = await netForRegions(regions);
  // Kalendarze w kolejności paczek w sieci.
  const cals = await Promise.all(net.regions.map(async (r) => (await openRegion(r)).cal));
  const now = athensNow();
  const day = when === 'tomorrow' ? addDays(now, 1) : now;
  const prev = when === 'tomorrow' ? now : now.prev;
  const at = when === 'now' ? now.sec : time;
  // Oddajemy ekranowi chwilę na narysowanie wskaźnika ładowania, zanim policzymy trasę.
  await new Promise((r) => setTimeout(r, 30));
  return { net, at, result: plan(net, cals, { from, to, day, prev, at }) };
}

/**
 * Ostatni powrót dziś z punktu `from` do `to` (np. do noclegu): najpóźniejszy odjazd, który jeszcze dowiezie na miejsce.
 * Przystanki do 800 m, a gdy tam nic – do 1,5 km (jak w planerze). null = dziś autobusem już się nie da.
 */
export async function lastReturn(regions: string[], from: LatLon, to: LatLon): Promise<{ net: Net; journey: Journey | null }> {
  const net = await netForRegions(regions);
  const cals = await Promise.all(net.regions.map(async (r) => (await openRegion(r)).cal));
  const now = athensNow();
  await new Promise((r) => setTimeout(r, 30));
  const trips = dayTrips(net, cals, now, now.prev);
  return { net, journey: lastBack(net, trips, from, to, now.sec, 800) ?? lastBack(net, trips, from, to, now.sec, 1500) };
}
