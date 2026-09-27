// Planer – wyniki (projekt: canvas „Wyniki”): 3–5 opcji z etykietami, porównanie z najbliższym przystankiem,
// ostatni powrót dziś, a gdy dziś nic nie jedzie – połączenia na jutro.
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { stopName, TripOption } from '@/components/TripOption';
import { LineBadge, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { openRegion } from '@/data/packages';
import { modeOf } from '@/data/queries';
import { t, useLang, type Key } from '@/i18n';
import type { LatLon } from '@/lib/geo';
import { currentPosition } from '@/lib/position';
import { athensNow, formatDate, hhmm } from '@/lib/time';
import { placeName } from '@/planner/format';
import type { RideLeg } from '@/planner/raptor';
import { planTrip, regionFor } from '@/planner/service';
import { setTrip, usePlanner, type Place } from '@/planner/store';

async function pointOf(p: Place): Promise<LatLon | null> {
  if (p.kind !== 'me') return { lat: p.lat, lon: p.lon };
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null)) ?? (await currentPosition(10_000));
  return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
}

export default function ResultsScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const { from, to, when, time, trip } = usePlanner();
  const [error, setError] = useState<Key | null>(null);
  const [validTo, setValidTo] = useState<number | null>(null);

  useEffect(() => {
    if (!to) return;
    let alive = true;
    setTrip(null);
    (async () => {
      const [a, b] = await Promise.all([pointOf(from), pointOf(to)]);
      if (!a || !b) throw new Error('needLocation');
      const region = regionFor(data.manifest?.packages ?? [], a, b);
      if (!region) throw new Error('noRegionRoute');
      const [{ net, at, result }, { meta }] = await Promise.all([planTrip(region, a, b, when, time), openRegion(region)]);
      if (!alive) return;
      setValidTo(meta.validTo);
      setTrip({ region, net, from, to, fromPoint: a, toPoint: b, result, at });
    })().catch((e: Error) => {
      if (alive) setError(e.message === 'needLocation' || e.message === 'noRegionRoute' ? (e.message as Key) : 'errorGeneric');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liczymy raz dla wybranych miejsc i godziny
  }, [from, to, when, time]);

  const res = trip?.result;
  const net = trip?.net;
  const nowSec = res && !res.tomorrow && when !== 'tomorrow' ? athensNow().sec : null;
  const startAt = trip ? (res?.tomorrow ? 0 : trip.at) : null;
  const back = res?.lastBack;
  const backRide = back?.legs.find((l): l is RideLeg => l.kind === 'ride');

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} style={s.round}>
          <Icon name="chevronL" size={22} stroke={2.4} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt w="black" size={19} color={C.ink} numberOfLines={2}>
            {placeName(from)} → {placeName(to)}
          </Txt>
          <View style={s.subRow}>
            <Txt w="bold" size={14} color={C.muted}>
              {startAt !== null
                ? (res?.tomorrow || when === 'tomorrow' ? t('resultsTomorrow', { time: hhmm(res?.options[0]?.leave ?? startAt) }) : t('resultsToday', { time: hhmm(startAt) }))
                : ' '}
            </Txt>
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Txt w="extrabold" size={14} color={C.blue}>
                {t('change')}
              </Txt>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {!res && !error ? (
          <View style={s.center}>
            <ActivityIndicator color={C.blue} size="large" />
            <Txt w="bold" color={C.muted}>
              {t('planning')}
            </Txt>
          </View>
        ) : null}
        {error ? (
          <View style={s.info}>
            <Icon name="pin" size={22} color={C.orange} />
            <Txt w="bold" size={15} color={C.text2} style={{ flex: 1 }}>
              {t(error)}
            </Txt>
          </View>
        ) : null}

        {res && net ? (
          <>
            {res.tomorrow ? (
              <View style={s.info}>
                <Icon name="moon" size={22} color={C.blue} />
                <Txt w="bold" size={14} color={C.text2} style={{ flex: 1 }}>
                  {t('tomorrowNote')}
                </Txt>
              </View>
            ) : null}
            {res.walkOnlyMin ? (
              <View style={s.info}>
                <Icon name="walk" size={22} color={C.blue} />
                <Txt w="bold" size={14} color={C.text2} style={{ flex: 1 }}>
                  {t('walkOnly', { min: res.walkOnlyMin })}
                </Txt>
              </View>
            ) : null}
            {res.comparison ? (
              <View style={[s.info, { backgroundColor: C.greenBg }]}>
                <Icon name="bus" size={22} color={C.green} />
                <Txt w="bold" size={14} color={C.green} style={{ flex: 1, lineHeight: 20 }}>
                  {t('compareIntro', {
                    stop: stopName(net, net.stationStops.get(res.comparison.station)?.[0] ?? 0),
                    m: res.comparison.fartherM,
                    gain: [res.comparison.direct ? t('gainDirect') : null, res.comparison.fasterMin >= 5 ? t('gainFaster', { min: res.comparison.fasterMin }) : null]
                      .filter(Boolean)
                      .join(t('gainAnd')),
                  })}
                </Txt>
              </View>
            ) : null}
            {res.options.length === 0 ? (
              <View style={s.info}>
                <Icon name="route" size={22} color={C.orange} />
                <Txt w="bold" size={15} color={C.text2} style={{ flex: 1 }}>
                  {t('noRoute')}
                </Txt>
              </View>
            ) : null}

            {res.options.map((o, i) => (
              <TripOption key={i} net={net} o={o} nowSec={nowSec} onPress={() => router.push({ pathname: '/planer/szczegoly', params: { i: String(i) } })} />
            ))}

            {back && backRide && !res.tomorrow ? (
              <View style={s.back}>
                <View style={s.backIcon}>
                  <Icon name="moon" size={26} color="#FFFFFF" stroke={2.2} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt w="extrabold" size={14} color={C.orangeText}>
                    {t('lastBackTitle')}
                  </Txt>
                  <View style={s.backRow}>
                    <Txt w="black" size={28} color={C.orangeDeep}>
                      {backRide.depEst ? t('approx', { time: hhmm(backRide.dep) }) : hhmm(backRide.dep)}
                    </Txt>
                    {(() => {
                      const r = net.routes.get(net.patterns[backRide.pattern].route);
                      return <LineBadge label={r?.shortName || '?'} color={r?.color ?? null} agencyCode={r?.agencyCode ?? ''} mode={modeOf(r?.type ?? 3)} />;
                    })()}
                  </View>
                  <Txt w="bold" size={12} color={C.orangeDeep}>
                    {t('lastBackFrom', { stop: stopName(net, backRide.board), time: hhmm(back.arrive) })}
                  </Txt>
                </View>
              </View>
            ) : null}

            {validTo ? (
              <Txt w="bold" size={12} color={C.muted} style={{ marginHorizontal: 8 }}>
                {t('timetableValid', { date: formatDate(validTo) })}
              </Txt>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: 14, ...shadow },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sky, borderRadius: 16, padding: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.orangeBg, borderColor: C.orangeLine, borderWidth: 1.5, borderRadius: 18, padding: 14, marginTop: 4 },
  backIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
