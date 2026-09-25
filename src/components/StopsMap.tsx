// Mapa przystanków: MapLibre + OpenStreetMap (kafelki OpenFreeMap, bez klucza). Przystanki z pobranych paczek
// w widocznym obszarze; dotknięcie → karta z najbliższymi odjazdami. Nie działa w Expo Go (moduł natywny).
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  UserLocation,
  type CameraRef,
  type InitialViewState,
  type MapRef,
  type PressEvent,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type NativeSyntheticEvent } from 'react-native';

import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { stationDepartures, stationsInBox, type Departure, type Station } from '@/data/queries';
import { t } from '@/i18n';
import { getSettings } from '@/lib/settings';
import { athensNow } from '@/lib/time';

import { Icon } from './Icon';
import { StationCard } from './StationCard';
import { Txt } from './ui';

/** Jasny styl mapy – niebieskie przystanki OpaBus dobrze na nim widać. Atrybucja © OpenStreetMap jest w stylu. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
/** Poniżej tego przybliżenia nie rysujemy przystanków (za dużo punktów). */
const MIN_ZOOM_STOPS = 12.5;
const GREECE: InitialViewState = { center: [23.7, 38.4], zoom: 5.6 };

type Pin = Station & { region: string };
const pinKey = (p: { region: string; id: number }) => `${p.region}:${p.id}`;

export default function StopsMap() {
  const data = useData();
  const camera = useRef<CameraRef>(null);
  const map = useRef<MapRef>(null);
  const query = useRef(0);
  const [initial, setInitial] = useState<InitialViewState | null>(null);
  const [hasLoc, setHasLoc] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [selected, setSelected] = useState<Pin | null>(null);
  const [deps, setDeps] = useState<Departure[] | null>(null);
  const [nowSec, setNowSec] = useState(0);

  // Widok startowy: pozycja użytkownika (jeśli jest w pobranym regionie), inaczej region „domowy”, inaczej cała Grecja.
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      const last = perm.granted ? await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }).catch(() => null) : null;
      const pkgs = (data.manifest?.packages ?? []).filter((p) => data.installed[p.region]);
      let view: InitialViewState = GREECE;
      if (last && pkgs.some((p) => inside(p.bbox, last.coords.latitude, last.coords.longitude))) {
        view = { center: [last.coords.longitude, last.coords.latitude], zoom: 15 };
      } else {
        const home = pkgs.find((p) => p.region === getSettings().homeRegion) ?? pkgs[0];
        if (home) view = { bounds: [home.bbox[1], home.bbox[0], home.bbox[3], home.bbox[2]] };
      }
      if (!alive) return;
      setHasLoc(perm.granted);
      setInitial(view);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- widok startowy liczymy tylko raz, przy otwarciu mapy
  }, []);

  // Przystanki w widocznym obszarze – po każdym przesunięciu mapy.
  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { zoom, bounds } = e.nativeEvent;
    const id = ++query.current;
    if (zoom < MIN_ZOOM_STOPS) {
      setZoomedOut(true);
      setPins([]);
      return;
    }
    setZoomedOut(false);
    const [west, south, east, north] = bounds;
    const regions = (data.manifest?.packages ?? [])
      .filter((p) => data.installed[p.region] && p.bbox[0] <= north && p.bbox[2] >= south && p.bbox[1] <= east && p.bbox[3] >= west)
      .map((p) => p.region);
    Promise.all(
      regions.map(async (region) => {
        const { db } = await openRegion(region);
        return (await stationsInBox(db, south, west, north, east)).map((s) => ({ ...s, region }));
      }),
    )
      .then((lists) => query.current === id && setPins(lists.flat()))
      .catch(() => {});
  };

  const onPress = async (e: NativeSyntheticEvent<PressEvent> | NativeSyntheticEvent<PressEventWithFeatures>) => {
    const [x, y] = e.nativeEvent.point;
    const feats = await map.current?.queryRenderedFeatures(
      [
        [x - 16, y - 16],
        [x + 16, y + 16],
      ],
      { layers: ['stations-dot'] },
    );
    const key = feats?.[0]?.properties?.key;
    const pin = pins.find((p) => pinKey(p) === key) ?? null;
    setSelected(pin);
    setDeps(null);
    if (!pin) return;
    const n = athensNow();
    try {
      const { db, cal } = await openRegion(pin.region);
      const list = await stationDepartures(db, cal, pin.id, n, n.sec - 60, n.sec + 90 * 60);
      setNowSec(n.sec);
      setDeps(list.filter((d) => d.dep >= n.sec - 30).slice(0, 3));
    } catch {
      setDeps([]);
    }
  };

  const locate = async () => {
    const perm = hasLoc ? { granted: true } : await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    setHasLoc(true);
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null)) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
    if (pos) camera.current?.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 700 });
  };

  if (!initial) return <View style={s.fill} />;

  const features: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { key: pinKey(p), label: stationNames(p).main },
    })),
  };
  const names = selected ? stationNames(selected) : null;

  return (
    <View style={s.fill}>
      <MapView
        ref={map}
        style={s.fill}
        mapStyle={MAP_STYLE}
        logo={false}
        attributionPosition={{ top: 8, left: 8 }}
        compassPosition={{ top: 64, right: 12 }}
        touchPitch={false}
        onPress={onPress}
        onRegionDidChange={onRegionDidChange}>
        <Camera ref={camera} initialViewState={initial} minZoom={5} maxZoom={18} />
        <GeoJSONSource id="stations" data={features}>
          <Layer
            type="circle"
            id="stations-dot"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 4, 16, 8],
              'circle-color': C.blue,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            type="symbol"
            id="stations-label"
            minzoom={15}
            layout={{
              'text-field': ['get', 'label'],
              'text-font': ['Noto Sans Bold'],
              'text-size': 12,
              'text-offset': [0, 1.1],
              'text-anchor': 'top',
              'text-optional': true,
            }}
            paint={{ 'text-color': C.ink, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 }}
          />
        </GeoJSONSource>
        {selected ? (
          <GeoJSONSource id="selected" data={{ type: 'Feature', geometry: { type: 'Point', coordinates: [selected.lon, selected.lat] }, properties: {} }}>
            <Layer type="circle" id="selected-dot" paint={{ 'circle-radius': 11, 'circle-color': C.orange, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
          </GeoJSONSource>
        ) : null}
        {hasLoc ? <UserLocation animated accuracy /> : null}
      </MapView>

      <Pressable accessibilityRole="button" accessibilityLabel={t('myLocation')} onPress={locate} style={s.locate}>
        <Icon name="locate" size={22} color={C.blue} stroke={2.2} />
      </Pressable>

      {zoomedOut ? (
        <View pointerEvents="none" style={s.hint}>
          <Txt w="extrabold" size={13} color={C.ink}>
            {t('mapZoomIn')}
          </Txt>
        </View>
      ) : null}

      {selected && names ? (
        <View style={s.card}>
          <StationCard
            region={selected.region}
            station={selected.id}
            title={names.main}
            sub={[names.sub, data.regionName(selected.region)].filter(Boolean).join(' · ')}
            departures={deps}
            nowSec={nowSec}
            emptyText={t('noDeparturesSoon')}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={10} onPress={() => setSelected(null)}>
                <Icon name="x" size={20} color={C.muted} stroke={2.4} />
              </Pressable>
            }
          />
        </View>
      ) : null}
    </View>
  );
}

function inside(bbox: number[], lat: number, lon: number) {
  return lat >= bbox[0] && lat <= bbox[2] && lon >= bbox[1] && lon <= bbox[3];
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  locate: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    top: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...shadow,
  },
  card: { position: 'absolute', left: 12, right: 12, bottom: 12, ...shadow },
});
