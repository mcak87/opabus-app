// Start – najbliższe przystanki z najbliższymi odjazdami (zasada 10 planera: kilka przystanków w okolicy).
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DepartureRow } from '@/components/DepartureRow';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Button, Card, PanoramaHeader, Pill, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { OVERLAY_REGIONS, useData } from '@/data/DataContext';
import { loadNearby, stationNames, type StationWithDeps } from '@/data/nearby';
import { t, useLang } from '@/i18n';
import { walkMinutes, type LatLon } from '@/lib/geo';
import { athensNow, hhmm } from '@/lib/time';

type Loc = { state: 'checking' } | { state: 'ask' } | { state: 'denied' } | { state: 'locating' } | { state: 'ok'; p: LatLon };

export default function StartScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const [loc, setLoc] = useState<Loc>({ state: 'checking' });
  const [items, setItems] = useState<StationWithDeps[] | null>(null);
  const [now, setNow] = useState(() => athensNow());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const locate = useCallback(async () => {
    setLoc({ state: 'locating' });
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
    if (last) setLoc({ state: 'ok', p: { lat: last.coords.latitude, lon: last.coords.longitude } });
    try {
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc({ state: 'ok', p: { lat: cur.coords.latitude, lon: cur.coords.longitude } });
    } catch {
      if (!last) setLoc({ state: 'denied' });
    }
  }, []);

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((perm) => {
      if (perm.granted) locate();
      else setLoc({ state: perm.canAskAgain ? 'ask' : 'denied' });
    });
  }, [locate]);

  const askPermission = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.granted) locate();
    else setLoc({ state: 'denied' });
  };

  const point = loc.state === 'ok' ? loc.p : null;
  const candidates = useMemo(() => (point ? data.regionsAt(point) : []), [point, data]);
  const primary = candidates.find((c) => data.installed[c.region]) ?? candidates[0];
  const regions = useMemo(
    () => [
      ...candidates.filter((c) => data.installed[c.region]).map((c) => c.region),
      ...[...OVERLAY_REGIONS].filter((r) => data.installed[r]),
    ],
    [candidates, data.installed],
  );
  const hasLocalRegion = candidates.some((c) => data.installed[c.region]);

  const [tick, setTick] = useState(0);

  // Odjazdy odświeżane co 30 s, gdy ekran jest widoczny.
  useFocusEffect(
    useCallback(() => {
      if (!point || !hasLocalRegion) return;
      let alive = true;
      const run = () => {
        const n = athensNow();
        loadNearby(point, regions, n)
          .then((r) => {
            if (!alive) return;
            setNow(n);
            setItems(r);
            setError(false);
          })
          .catch(() => alive && setError(true))
          .finally(() => alive && setRefreshing(false));
      };
      run();
      const id = setInterval(run, 30_000);
      return () => {
        alive = false;
        clearInterval(id);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` celowo wymusza ponowne wczytanie (pociągnij, aby odświeżyć)
    }, [point, regions, hasLocalRegion, tick]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (loc.state === 'ok') locate();
    setTick((x) => x + 1);
  };

  return (
    <View style={s.screen}>
      <PanoramaHeader region={primary?.region} height={72} style={{ paddingTop: insets.top + 12 }}>
        <View style={s.headRow}>
          <Logo />
          <Pill icon="cloudCheck" text={t('offlineBadge')} />
        </View>
        <Txt w="black" size={30} color={C.ink} style={s.title}>
          {t('nearbyTitle')}
        </Txt>
      </PanoramaHeader>

      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loc.state === 'checking' || loc.state === 'locating' ? (
          <View style={s.center}>
            <ActivityIndicator color={C.blue} />
            <Txt color={C.muted}>{t('locating')}</Txt>
          </View>
        ) : null}

        {loc.state === 'ask' ? (
          <Card style={s.gap}>
            <View style={s.rowGap}>
              <Icon name="pin" size={26} color={C.blue} />
              <Txt w="black" size={22} color={C.ink}>
                {t('locTitle')}
              </Txt>
            </View>
            <Txt w="semibold" color={C.muted}>
              {t('locBody')}
            </Txt>
            <Button title={t('locAllow')} icon="locate" onPress={askPermission} />
            <Button title={t('locManual')} icon="bus" kind="outline" onPress={() => router.push('/przystanki')} />
          </Card>
        ) : null}

        {loc.state === 'denied' ? (
          <Card style={s.gap}>
            <Txt w="bold" color={C.text2}>
              {t('locDenied')}
            </Txt>
            <Button title={t('locManual')} icon="search" onPress={() => router.push('/przystanki')} />
          </Card>
        ) : null}

        {point && candidates.length === 0 && data.manifest ? (
          <Card style={s.gap}>
            <Txt w="bold" color={C.text2}>
              {t('regionOutside')}
            </Txt>
            <Button title={t('chooseRegion')} kind="outline" onPress={() => router.push('/profil')} />
          </Card>
        ) : null}

        {point && primary && !hasLocalRegion ? (
          <Card style={s.gap}>
            <Txt w="black" size={22} color={C.ink}>
              {t('regionDetected', { name: data.regionName(primary.region) })}
            </Txt>
            <Txt w="semibold" color={C.muted}>
              {t('regionDownloadBody')}
            </Txt>
            <Button
              title={data.busy[primary.region] ? t('downloading') : t('regionDownload', { name: data.regionName(primary.region) })}
              icon="download"
              loading={data.busy[primary.region]}
              onPress={() => data.install(primary.region).catch(() => setError(true))}
            />
          </Card>
        ) : null}

        {point && hasLocalRegion && items ? (
          <>
            <View style={s.listHead}>
              <Txt w="black" size={19} color={C.ink}>
                {t('tabStops')}
              </Txt>
              <Txt w="bold" size={13} color={C.muted}>
                {t('nearbyNow', { time: hhmm(now.sec) })}
              </Txt>
            </View>
            {items.length === 0 ? <Txt color={C.muted}>{t('noStopsNearby')}</Txt> : null}
            {items.map((st) => {
              const n = stationNames(st);
              return (
                <Pressable
                  key={`${st.region}:${st.id}`}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/stop/[region]/[station]', params: { region: st.region, station: String(st.id) } })}
                  style={({ pressed }) => [s.stationCard, pressed && { opacity: 0.8 }]}>
                  <View style={s.rowGap}>
                    <View style={s.stationIcon}>
                      <Icon name="bus" size={20} color="#FFFFFF" stroke={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt w="extrabold" size={17} color={C.ink} numberOfLines={1}>
                        {n.main}
                      </Txt>
                      {n.sub ? (
                        <Txt w="semibold" size={13} color={C.muted} numberOfLines={1}>
                          {n.sub}
                        </Txt>
                      ) : null}
                    </View>
                    <View style={s.walk}>
                      <Icon name="walk" size={18} color={C.text2} />
                      <Txt w="extrabold" size={14} color={C.text2}>
                        {t('walkMin', { min: walkMinutes(st.dist) })}
                      </Txt>
                    </View>
                  </View>
                  {st.departures.length === 0 ? (
                    <Txt w="semibold" size={14} color={C.muted}>
                      {t('noDeparturesSoon')}
                    </Txt>
                  ) : (
                    st.departures.map((d) => <DepartureRow key={`${d.dayOffset}:${d.tripId}`} d={d} nowSec={now.sec} />)
                  )}
                </Pressable>
              );
            })}
          </>
        ) : null}

        {error ? (
          <Txt color={C.orangeText} style={s.gap}>
            {t('errorGeneric')}
          </Txt>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  title: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 56, lineHeight: 34 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  gap: { gap: 12 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  stationCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, gap: 6, borderWidth: 1, borderColor: C.line },
  stationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  walk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
