// Punkt wskazany na mapie (ekran /popraw/mapa) przekazywany z powrotem do ekranu, który o niego poprosił.
import type { LatLon } from './geo';

let picked: LatLon | null = null;

export function setPickedPoint(p: LatLon) {
  picked = p;
}

/** Zwraca wskazany punkt i czyści go (jednorazowo). */
export function takePickedPoint(): LatLon | null {
  const p = picked;
  picked = null;
  return p;
}
