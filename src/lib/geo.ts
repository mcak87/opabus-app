// Odległości i czas dojścia pieszo – zasady z CLAUDE.md (planer): linia prosta × 1,3, 4,5 km/h.

export type LatLon = { lat: number; lon: number };

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const WALK_FACTOR = 1.3;
export const WALK_M_PER_MIN = 4500 / 60;

export function walkMinutes(straightM: number): number {
  return Math.max(1, Math.round((straightM * WALK_FACTOR) / WALK_M_PER_MIN));
}

/** bbox z manifestu: [minLat, minLon, maxLat, maxLon] */
export function inBbox(p: LatLon, bbox: number[], marginDeg = 0.02): boolean {
  const [a, b, c, d] = bbox;
  return p.lat >= a - marginDeg && p.lat <= c + marginDeg && p.lon >= b - marginDeg && p.lon <= d + marginDeg;
}

export function bboxArea(bbox: number[]): number {
  return Math.abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]));
}
