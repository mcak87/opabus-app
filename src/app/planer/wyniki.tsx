// Planer – wyniki (projekt: canvas „Wyniki”): 3–5 opcji z etykietami, porównanie z najbliższym przystankiem,
// ostatni powrót dziś, a gdy dziś nic nie jedzie – połączenia na najbliższy dzień (promy: nawet kilka dni dalej).
// Sieć łączy regiony startu i celu z promami i koleją; gdy czegoś brakuje w telefonie – podpowiedź pobrania.
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { fileSize } from '@/components/RegionList';
import { stopName, TripOption } from '@/components/TripOption';
import { Button, LineBadge, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { cachedFares, fetchFares } from '@/data/fares';
import { openRegion, type PackageInfo } from '@/data/packages';
import { modeOf } from '@/data/queries';
import { getLang, t, useLang, type Key } from '@/i18n';
import type { LatLon } from '@/lib/geo';
import { currentPosition } from '@/lib/position';
import { athensNow, formatDate, hhmm } from '@/lib/time';
import { tripPrices, type FareFile } from '@/planner/fares';
import { dayName, hhmmDay, patternLabel, placeName, priceText } from '@/planner/format';
import type { RideLeg } from '@/planner/raptor';
import { planTrip, regionsFor } from '@/planner/service';
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
  const [missing, setMissing] = useState<PackageInfo[]>([]);
  const [installing, setInstalling] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!to) return;
    let alive = true;
    setTrip(null);
    (async () => {
      const [a, b] = await Promise.all([pointOf(from), pointOf(to)]);
      if (!a || !b) throw new Error('needLocation');
      const parts = regionsFor(data.manifest?.packages ?? [], a, b);
      setMissing(parts.missing);
      if (!parts.regions.length) throw new Error('noRegionRoute');
      const region = parts.primary ?? parts.regions[0];
      const { net, at, result } = await planTrip(parts.regions, a, b, when, time);
      // Ważność rozkładu: najwcześniejsza z paczek, z których jadą pokazane opcje.
      const used = new Set(result.options.flatMap((o) => o.legs.flatMap((l) => (l.kind === 'ride' ? [net.regions[net.patterns[l.pattern].part]] : []))));
      const metas = await Promise.all((used.size ? [...used] : [region]).map(async (r) => (await openRegion(r)).meta.validTo));
      // Cenniki: z telefonu, a gdy regionu startu jeszcze nie ma – próbujemy pobrać (bez internetu po prostu bez cen).
      const fares: Record<string, FareFile> = {};
      for (const r of net.regions) {
        const f = cachedFares(r) ?? (r === region ? await fetchFares(r).catch(() => null) : null);
        if (f) fares[r] = f;
      }
      if (!alive) return;
      setValidTo(Math.min(...metas));
      setTrip({ region, net, from, to, fromPoint: a, toPoint: b, result, at, fares: Object.keys(fares).length ? fares : null });
    })().catch((e: Error) => {
      if (alive) setError(e.message === 'needLocation' || e.message === 'noRegionRoute' ? (e.message as Key) : 'errorGeneric');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liczymy raz dla wybranych miejsc i godziny (i po pobraniu rozkładów)
  }, [from, to, when, time, attempt]);

  /** Pobiera brakujące paczki (region przy starcie/celu, promy, kolej) i liczy trasę jeszcze raz. */
  const installMissing = async () => {
    setInstalling(true);
    try {
      for (const p of missing) await data.install(p.region);
      setError(null);
      setAttempt((x) => x + 1);
    } catch {
      setError('errorGeneric');
    } finally {
      setInstalling(false);
    }
  };

  const res = trip?.result;
  const net = trip?.net;
  // Dni od dziś: gdy szukamy „jutro”, wynik z dniem zapasu to już pojutrze.
  const fromToday = (res?.daysAhead ?? 0) + (when === 'tomorrow' ? 1 : 0);
  const nowSec = res && fromToday === 0 ? athensNow().sec : null;
  const startAt = trip ? (res?.daysAhead ? 0 : trip.at) : null;
  const back = res?.lastBack;
  const backRide = back?.legs.find((l): l is RideLeg => l.kind === 'ride');
  const noOptions = !!error || (!!res && res.options.length === 0 && !res.walkOnlyMin);

  // Ceny opcji i „Najtaniej”: wyraźnie tańsza (o ≥ 0,50 €) od kolejnej opcji ze znaną ceną.
  const prices =
    trip?.fares && res && net ? res.options.map((o) => tripPrices(trip.fares!, net, o.legs.filter((l): l is RideLeg => l.kind === 'ride')).total) : null;
  const known = (prices ?? []).map((p, i) => ({ p, i })).filter((x) => x.p.kind !== 'unknown').sort((x, y) => x.p.max - y.p.max);
  const cheapest = known.length >= 2 && known[0].p.max + 0.5 <= known[1].p.max ? known[0].i : -1;
  const ktel = Object.values(trip?.fares ?? {}).find((f) => f.operators.KTEL?.label)?.operators.KTEL?.label;
  const fareLabel = ktel?.[getLang()] ?? ktel?.en;

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
              {startAt !== null && res
                ? fromToday === 0
                  ? t('resultsToday', { time: hhmm(startAt) })
                  : t('resultsOnDay', { day: dayName(res.day, fromToday), time: hhmm(res.options[0]?.leave ?? startAt) })
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
        {noOptions && missing.length > 0 && error !== 'needLocation' ? (
          <View style={s.missing}>
            <Txt w="black" size={15} color={C.ink}>
              {t('missingTitle')}
            </Txt>
            <Txt w="semibold" size={14} color={C.text2}>
              {t('missingBody', { list: missing.map((p) => data.regionName(p.region)).join(', ') })}
            </Txt>
            <Button
              title={t('missingButton', { size: fileSize(missing.reduce((n, p) => n + p.bytes, 0)) })}
              icon="download"
              loading={installing}
              onPress={installMissing}
            />
          </View>
        ) : null}

        {res && net ? (
          <>
            {res.daysAhead ? (
              <View style={s.info}>
                <Icon name="moon" size={22} color={C.blue} />
                <Txt w="bold" size={14} color={C.text2} style={{ flex: 1 }}>
                  {fromToday >= 2 ? t('daysAheadNote', { day: dayName(res.day, fromToday) }) : t('tomorrowNote')}
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
            {res.options.length === 0 && !res.walkOnlyMin ? (
              <View style={s.info}>
                <Icon name="route" size={22} color={C.orange} />
                <Txt w="bold" size={15} color={C.text2} style={{ flex: 1 }}>
                  {t('noRoute')}
                </Txt>
              </View>
            ) : null}

            {res.options.map((o, i) => (
              <TripOption
                key={i}
                net={net}
                o={o}
                nowSec={nowSec}
                price={prices ? priceText(prices[i]) : undefined}
                extraLabels={i === cheapest ? ['cheapest'] : []}
                onPress={() => router.push({ pathname: '/planer/szczegoly', params: { i: String(i) } })} />
            ))}

            {back && backRide && !res.daysAhead ? (
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
                      return <LineBadge label={patternLabel(net, backRide.pattern)} color={r?.color ?? null} agencyCode={r?.agencyCode ?? ''} mode={modeOf(r?.type ?? 3)} />;
                    })()}
                  </View>
                  <Txt w="bold" size={12} color={C.orangeDeep}>
                    {t('lastBackFrom', { stop: stopName(net, backRide.board), time: hhmmDay(back.arrive) })}
                  </Txt>
                </View>
              </View>
            ) : null}

            {prices && fareLabel ? (
              <Txt w="bold" size={12} color={C.muted} style={{ marginHorizontal: 8 }}>
                {[t('fareSource', { label: fareLabel }), prices.some((p) => p.kind === 'upTo') ? t('fareUpToNote') : null].filter(Boolean).join(' ')}
              </Txt>
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
  missing: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 10, ...shadow },
  back: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.orangeBg, borderColor: C.orangeLine, borderWidth: 1.5, borderRadius: 18, padding: 14, marginTop: 4 },
  backIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
