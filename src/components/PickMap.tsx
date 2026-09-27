// Planer – wskazanie punktu na mapie (projekt: canvas „Mapa”): pinezka na środku, najbliższy przystanek i czas dojścia.
// Moduł natywny MapLibre – ładowany tylko poza Expo Go.
import { Camera, Map as MapView, type InitialViewState, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAP_STYLE } from '@/constants/map';
import { C, shadow } from '@/constants/theme';
import { OVERLAY_REGIONS, useData } from '@/data/DataContext';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { nearbyStations, type NearbyStation } from '@/data/queries';
import { t } from '@/i18n';
import { inBbox, walkMinutes, type LatLon } from '@/lib/geo';
import { getSettings } from '@/lib/settings';
import type { Place } from '@/planner/store';

import { Icon } from './Icon';
import { Button, Txt } from './ui';

export default function PickMap({ field, onPick }: { field: 'from' | 'to'; onPick: (p: Place) => void }) {
  const insets = useSafeAreaInsets();
  const data = useData();
  const [initial, setInitial] = useState<InitialViewState | null>(null);
  const [center, setCenter] = useState<LatLon | null>(null);
  const [near, setNear] = useState<(NearbyStation & { region: string }) | null>(null);
  const query = useRef(0);

  // Start: moja pozycja (jeśli w pobranym regionie), inaczej region domowy.
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      const last = perm.granted ? await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }).catch(() => null) : null;
      const pkgs = (data.manifest?.packages ?? []).filter((p) => data.installed[p.region] && !OVERLAY_REGIONS.has(p.region));
      let view: InitialViewState = { center: [23.7, 38.4], zoom: 5.6 };
      if (last && pkgs.some((p) => inBbox({ lat: last.coords.latitude, lon: last.coords.longitude }, p.bbox, 0))) {
        view = { center: [last.coords.longitude, last.coords.latitude], zoom: 15 };
      } else {
        const home = pkgs.find((p) => p.region === getSettings().homeRegion) ?? pkgs[0];
        if (home) view = { center: [(home.bbox[1] + home.bbox[3]) / 2, (home.bbox[0] + home.bbox[2]) / 2], zoom: 11 };
      }
      if (alive) setInitial(view);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- widok startowy tylko raz
  }, []);

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const [lon, lat] = e.nativeEvent.center;
    const p = { lat, lon };
    setCenter(p);
    const id = ++query.current;
    const regions = (data.manifest?.packages ?? []).filter((x) => data.installed[x.region] && !OVERLAY_REGIONS.has(x.region) && inBbox(p, x.bbox));
    Promise.all(
      regions.map(async (r) => {
        const { db } = await openRegion(r.region);
        return (await nearbyStations(db, lat, lon, 1500, 1)).map((s) => ({ ...s, region: r.region }));
      }),
    )
      .then((lists) => {
        if (query.current !== id) return;
        setNear(lists.flat().sort((a, b) => a.dist - b.dist)[0] ?? null);
      })
      .catch(() => {});
  };

  if (!initial) return <View style={s.fill} />;
  const n = near ? stationNames(near) : null;

  const pick = () => {
    if (!center) return;
    const label = n ? t('pointNear', { name: n.main }) : t('planPickOnMap');
    onPick({ kind: 'point', lat: center.lat, lon: center.lon, name: label, name_en: label });
  };

  return (
    <View style={s.fill}>
      <MapView style={s.fill} mapStyle={MAP_STYLE} logo={false} attributionPosition={{ top: 8, left: 8 }} touchPitch={false} onRegionDidChange={onRegionDidChange}>
        <Camera initialViewState={initial} minZoom={5} maxZoom={18} />
      </MapView>
      <View pointerEvents="none" style={s.pin}>
        <Icon name="pin" size={48} color={C.orange} stroke={2.4} fill="#FFFFFF" />
      </View>
      <View pointerEvents="none" style={s.hint}>
        <Txt w="extrabold" size={13} color={C.ink}>
          {t('mapPickHint')}
        </Txt>
      </View>
      <View style={[s.card, { paddingBottom: insets.bottom + 16 }]}>
        {n && near ? (
          <View style={s.nearRow}>
            <View style={s.stopIcon}>
              <Icon name="bus" size={18} color="#FFFFFF" stroke={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt w="bold" size={12} color={C.muted}>
                {t('nearestStop')}
              </Txt>
              <Txt w="extrabold" size={16} color={C.ink} numberOfLines={1}>
                {n.main}
              </Txt>
            </View>
            <View style={s.walk}>
              <Icon name="walk" size={18} color={C.text2} />
              <Txt w="extrabold" size={14} color={C.text2}>
                {t('walkMin', { min: walkMinutes(near.dist) })}
              </Txt>
            </View>
          </View>
        ) : null}
        <Button title={field === 'from' ? t('setAsFrom') : t('setAsTo')} icon="pin" disabled={!center} onPress={pick} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  pin: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  hint: { position: 'absolute', alignSelf: 'center', top: 14, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, ...shadow },
  card: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12, ...shadow },
  nearRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  walk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
