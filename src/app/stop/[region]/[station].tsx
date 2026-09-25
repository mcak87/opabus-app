// Odjazdy ze stacji (przystanek = stacja: słupki po obu stronach ulicy i perony razem).
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LineBadge, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { minutesTo, stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { lastDeparturesToday, stationById, stationDepartures, type Departure, type RegionMeta, type Station } from '@/data/queries';
import { t, useLang } from '@/i18n';
import { athensNow, formatDate, type Now } from '@/lib/time';

const STEP = 3 * 3600;

export default function StopScreen() {
  useLang();
  const { region, station } = useLocalSearchParams<{ region: string; station: string }>();
  const [st, setSt] = useState<Station | null>(null);
  const [meta, setMeta] = useState<RegionMeta | null>(null);
  const [deps, setDeps] = useState<Departure[] | null>(null);
  const [last, setLast] = useState<Departure[]>([]);
  const [now, setNow] = useState<Now>(() => athensNow());
  const [span, setSpan] = useState(STEP);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { db, cal, meta: m } = await openRegion(region);
      const id = Number(station);
      const n = athensNow();
      setNow(n);
      setMeta(m);
      setSt(await stationById(db, id));
      const list = await stationDepartures(db, cal, id, n, n.sec - 60, n.sec + span);
      setDeps(list.filter((d) => d.dep >= n.sec - 30));
      setLast((await lastDeparturesToday(db, cal, id, n)).filter((d) => d.dep >= n.sec - 30));
    } catch {
      setError(true);
    }
  }, [region, station, span]);

  useFocusEffect(
    useCallback(() => {
      load();
      const tmr = setInterval(load, 30_000);
      return () => clearInterval(tmr);
    }, [load]),
  );

  const names = st ? stationNames(st) : null;
  const expired = meta && meta.validTo > 0 && meta.validTo < now.date;

  return (
    <View style={s.screen}>
      <ScreenHeader region={region} kicker={t('departuresTitle')} title={names?.main ?? '…'} sub={names?.sub} />
      <ScrollView contentContainerStyle={s.body}>
        {meta ? (
          <Txt w="bold" size={13} color={expired ? C.orangeText : C.muted} style={{ paddingHorizontal: 8 }}>
            {expired ? t('timetableExpired', { date: formatDate(meta.validTo) }) : t('timetableValid', { date: formatDate(meta.validTo) })}
          </Txt>
        ) : null}

        {!deps && !error ? <ActivityIndicator color={C.blue} style={{ marginTop: 24 }} /> : null}
        {error ? <Txt color={C.orangeText}>{t('errorGeneric')}</Txt> : null}
        {deps && deps.length === 0 ? <Txt color={C.muted}>{t('noDeparturesSoon')}</Txt> : null}

        {deps?.map((d) => {
          const min = minutesTo(d.dep, now.sec);
          return (
            <Pressable
              key={`${d.dayOffset}:${d.tripId}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/trip/[region]/[trip]', params: { region, trip: String(d.tripId), from: String(station) } })
              }
              style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
              <View style={s.timeCol}>
                <Txt w="black" size={20} color={C.ink}>
                  {d.time}
                </Txt>
                <Txt w="extrabold" size={12} color={C.blue}>
                  {min <= 0 ? t('now') : min < 120 ? t('inMin', { min }) : ' '}
                </Txt>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={s.badgeRow}>
                  <LineBadge label={d.shortName} color={d.color} agencyCode={d.agencyCode} mode={d.mode} />
                  <Txt w="extrabold" size={15} numberOfLines={1} style={{ flex: 1 }}>
                    {d.headsign}
                  </Txt>
                </View>
                <Txt w="bold" size={12} color={C.muted} numberOfLines={1}>
                  {[d.est ? t('approx', { time: d.time }) : null, d.agency].filter(Boolean).join(' · ')}
                </Txt>
              </View>
              <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
            </Pressable>
          );
        })}

        {deps && deps.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setSpan((x) => x + STEP)} style={s.more}>
            <Txt w="extrabold" color={C.blue}>
              {t('showMore')}
            </Txt>
          </Pressable>
        ) : null}

        {last.length > 0 ? (
          <View style={s.lastCard}>
            <View style={s.lastIcon}>
              <Icon name="moon" size={24} color="#FFFFFF" stroke={2.2} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt w="extrabold" size={14} color={C.orangeText}>
                {t('lastToday')}
              </Txt>
              {last.slice(-4).map((d) => (
                <View key={d.headsign} style={s.badgeRow}>
                  <Txt w="black" size={18} color={C.orangeDeep} style={{ minWidth: 56 }}>
                    {d.time}
                  </Txt>
                  <Txt w="bold" size={14} color={C.orangeDeep} numberOfLines={1} style={{ flex: 1 }}>
                    {d.headsign}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  timeCol: { width: 64 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  more: { alignItems: 'center', paddingVertical: 12 },
  lastCard: { flexDirection: 'row', gap: 14, backgroundColor: C.orangeBg, borderColor: C.orangeLine, borderWidth: 1.5, borderRadius: 18, padding: 14, marginTop: 4 },
  lastIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
});
