// Start – z lokalizacją: najbliższe przystanki z odjazdami (zasada 10 planera: kilka przystanków w okolicy).
// Bez lokalizacji (albo poza regionami): „Skąd chcesz jechać?” – wyszukiwarka, ulubione, popularne przystanki regionu.
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { EnableLocationCard, FavoritesSection, PopularSection } from '@/components/StartSections';
import { SectionTitle, StationCard } from '@/components/StationCard';
import { Button, Card, PanoramaHeader, Pill, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { OVERLAY_REGIONS, useData } from '@/data/DataContext';
import { loadNearby, stationNames, type StationWithDeps } from '@/data/nearby';
import { t, useLang } from '@/i18n';
import { POSITION_OPTIONS } from '@/lib/position';
import { walkMinutes, type LatLon } from '@/lib/geo';
import { setHomeRegion, useSettings } from '@/lib/settings';
import { athensNow, hhmm } from '@/lib/time';

type Loc =
  | { state: 'checking' }
  | { state: 'locating' }
  | { state: 'ok'; p: LatLon }
  /** canAsk: można jeszcze zapytać o zgodę; gps: zgoda jest, ale telefon nie podaje pozycji (wyłączona lokalizacja). */
  | { state: 'off'; canAsk: boolean; gps?: boolean };

export default function StartScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const { homeRegion } = useSettings();
  const [loc, setLoc] = useState<Loc>({ state: 'checking' });
  const [items, setItems] = useState<StationWithDeps[] | null>(null);
  const [now, setNow] = useState(() => athensNow());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const [pickRegion, setPickRegion] = useState(false);

  const locate = useCallback(async () => {
    setLoc({ state: 'locating' });
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
    if (last) setLoc({ state: 'ok', p: { lat: last.coords.latitude, lon: last.coords.longitude } });
    try {
      const cur = await Location.getCurrentPositionAsync(POSITION_OPTIONS);
      setLoc({ state: 'ok', p: { lat: cur.coords.latitude, lon: cur.coords.longitude } });
    } catch {
      if (!last) setLoc({ state: 'off', canAsk: true, gps: true });
    }
  }, []);

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((perm) => {
      if (perm.granted) locate();
      else setLoc({ state: 'off', canAsk: perm.canAskAgain });
    });
  }, [locate]);

  // Powrót z ustawień telefonu: jeśli lokalizacja została włączona, od razu jej używamy.
  useEffect(() => {
    if (loc.state !== 'off') return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      Location.getForegroundPermissionsAsync().then((perm) => {
        if (perm.granted) locate();
      });
    });
    return () => sub.remove();
  }, [loc.state, locate]);

  const enableLocation = async () => {
    if (loc.state !== 'off') return;
    if (loc.gps) {
      // Android pozwala włączyć lokalizację okienkiem systemowym; iPhone – tylko w ustawieniach.
      if (Platform.OS === 'android') await Location.enableNetworkProviderAsync().then(locate, () => {});
      else Linking.openSettings();
      return;
    }
    if (!loc.canAsk) {
      Linking.openSettings();
      return;
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.granted) locate();
    else setLoc({ state: 'off', canAsk: perm.canAskAgain });
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
  const installedRegions = Object.keys(data.installed).filter((r) => !OVERLAY_REGIONS.has(r));
  const manualRegion = homeRegion && data.installed[homeRegion] ? homeRegion : installedRegions[0];
  const outside = !!point && !!data.manifest && candidates.length === 0;

  const mode: 'wait' | 'nearby' | 'download' | 'manual' =
    loc.state === 'checking' || loc.state === 'locating' ? 'wait' : point && hasLocalRegion ? 'nearby' : point && primary ? 'download' : 'manual';

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
          .catch(() => alive && setError(true));
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
    setTimeout(() => setRefreshing(false), 700);
  };

  const header =
    mode === 'manual' ? (
      <PanoramaHeader region={manualRegion} height={64} style={{ paddingTop: insets.top + 12, paddingBottom: 40 }}>
        <View style={s.headRow}>
          <Logo />
          {manualRegion ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('changeRegion')}
              accessibilityState={{ expanded: pickRegion }}
              onPress={() => setPickRegion((x) => !x)}
              style={s.chip}>
              <Icon name="pin" size={18} color={C.blue} stroke={2.2} />
              <Txt w="extrabold" size={14} color={C.ink} numberOfLines={1} style={{ maxWidth: 140 }}>
                {data.regionName(manualRegion)}
              </Txt>
              <Icon name="chevronD" size={16} color={C.muted} stroke={2.4} />
            </Pressable>
          ) : null}
        </View>
        <Txt w="black" size={29} color={C.ink} style={s.title}>
          {t('manualTitle')}
        </Txt>
        <Txt w="bold" size={15} color={C.text2} style={s.sub}>
          {t('manualSub')}
        </Txt>
      </PanoramaHeader>
    ) : (
      <PanoramaHeader region={primary?.region} height={72} style={{ paddingTop: insets.top + 12 }}>
        <View style={s.headRow}>
          <Logo />
          <Pill icon="cloudCheck" text={t('offlineBadge')} />
        </View>
        <Txt w="black" size={30} color={C.ink} style={[s.title, { paddingBottom: 56 }]}>
          {t('nearbyTitle')}
        </Txt>
      </PanoramaHeader>
    );

  return (
    <View style={s.screen}>
      {header}

      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {mode === 'wait' ? (
          <View style={s.center}>
            <ActivityIndicator color={C.blue} />
            <Txt color={C.muted}>{t('locating')}</Txt>
          </View>
        ) : null}

        {mode === 'download' && primary ? (
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

        {mode === 'nearby' && items ? (
          <>
            <SectionTitle text={t('tabStops')} right={t('nearbyNow', { time: hhmm(now.sec) })} />
            {items.length === 0 ? <Txt color={C.muted}>{t('noStopsNearby')}</Txt> : null}
            {/* Nic w pobliżu (np. hotel poza trasami autobusów) – podpowiadamy węzły regionu. */}
            {items.length === 0 && primary ? <PopularSection region={primary.region} /> : null}
            {items.map((st) => {
              const n = stationNames(st);
              return (
                <StationCard
                  key={`${st.region}:${st.id}`}
                  region={st.region}
                  station={st.id}
                  title={n.main}
                  sub={n.sub}
                  departures={st.departures}
                  nowSec={now.sec}
                  emptyText={t('noDeparturesSoon')}
                  right={
                    <View style={s.walk}>
                      <Icon name="walk" size={18} color={C.text2} />
                      <Txt w="extrabold" size={14} color={C.text2}>
                        {t('walkMin', { min: walkMinutes(st.dist) })}
                      </Txt>
                    </View>
                  }
                />
              );
            })}
          </>
        ) : null}

        {mode === 'manual' ? (
          <>
            {manualRegion ? (
              <Pressable
                accessibilityRole="search"
                onPress={() => router.push({ pathname: '/przystanki', params: { focus: '1' } })}
                style={s.search}>
                <Icon name="search" size={22} color={C.muted} stroke={2.2} />
                <Txt w="bold" size={16} color="#7A849E">
                  {t('searchPlaceholder')}
                </Txt>
              </Pressable>
            ) : null}

            {pickRegion && manualRegion ? (
              <View style={s.pickCard}>
                {installedRegions.map((r) => (
                  <Pressable
                    key={r}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: r === manualRegion }}
                    onPress={() => {
                      setHomeRegion(r);
                      setPickRegion(false);
                    }}
                    style={[s.pickRow, r === manualRegion && { backgroundColor: C.sky }]}>
                    <Txt w="extrabold" size={16} color={C.ink} style={{ flex: 1 }}>
                      {data.regionName(r)}
                    </Txt>
                    {r === manualRegion ? <Icon name="check" size={20} color={C.blue} stroke={2.6} /> : null}
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setPickRegion(false);
                    router.push('/profil');
                  }}
                  style={s.pickRow}>
                  <Txt w="extrabold" size={16} color={C.blue} style={{ flex: 1 }}>
                    {t('otherRegion')}
                  </Txt>
                  <Icon name="chevronR" size={18} color={C.blue} stroke={2.4} />
                </Pressable>
              </View>
            ) : null}

            {outside && manualRegion ? (
              <Txt w="bold" size={14} color={C.text2} style={{ paddingHorizontal: 4 }}>
                {t('outsideShowing', { name: data.regionName(manualRegion) })}
              </Txt>
            ) : null}

            {!manualRegion ? (
              <Card style={s.gap}>
                <Txt w="bold" color={C.text2}>
                  {outside ? t('regionOutside') : t('noRegionYet')}
                </Txt>
                <Button title={t('chooseRegion')} icon="download" onPress={() => router.push('/profil')} />
              </Card>
            ) : null}
          </>
        ) : null}

        <FavoritesSection tick={tick} />

        {mode === 'manual' && manualRegion ? <PopularSection region={manualRegion} /> : null}

        {mode === 'manual' && loc.state === 'off' ? <EnableLocationCard canAsk={loc.canAsk && !loc.gps} onPress={enableLocation} /> : null}

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
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 12 },
  title: { paddingHorizontal: 20, paddingTop: 12, lineHeight: 34 },
  sub: { paddingHorizontal: 20, paddingTop: 4, lineHeight: 21 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  gap: { gap: 12 },
  walk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    ...shadow,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    ...shadow,
  },
  pickCard: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', ...shadow },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
});
