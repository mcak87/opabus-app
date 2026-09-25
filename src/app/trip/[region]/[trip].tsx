// Przebieg kursu – wszystkie przystanki z godzinami, wyróżniony przystanek, na którym użytkownik wsiada.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { tripTimeline, type TripStop } from '@/data/queries';
import { t, useLang } from '@/i18n';

export default function TripScreen() {
  useLang();
  const { region, trip, from } = useLocalSearchParams<{ region: string; trip: string; from?: string }>();
  const [stops, setStops] = useState<TripStop[] | null>(null);
  const [title, setTitle] = useState('');
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const { db } = await openRegion(region);
      const tl = await tripTimeline(db, Number(trip));
      const route = await db.all<{ short_name: string; long_name: string; headsign: string }>(
        `SELECT r.short_name, r.long_name, p.headsign FROM trips t JOIN patterns p ON p.id = t.pattern_id JOIN routes r ON r.id = p.route_id WHERE t.id = ?`,
        [Number(trip)],
      );
      setTitle(route[0] ? `${route[0].short_name || route[0].long_name} → ${route[0].headsign}` : '');
      setStops(tl);
    })();
  }, [region, trip]);

  const boardIdx = stops?.findIndex((s) => String(s.stationId) === from) ?? -1;
  const hasEst = stops?.some((s) => s.est);

  return (
    <View style={s.screen}>
      <ScreenHeader region={region} kicker={t('tripTitle')} title={title || '…'} />
      <ScrollView ref={scroll} contentContainerStyle={s.body}>
        {hasEst ? (
          <Txt w="bold" size={12} color={C.muted} style={{ paddingHorizontal: 8 }}>
            {t('approxNote')}
          </Txt>
        ) : null}
        <View style={s.card}>
          {stops?.map((st, i) => {
            const passed = boardIdx >= 0 && i < boardIdx;
            const board = i === boardIdx;
            const n = stationNames(st);
            const lineColor = passed ? C.line : C.blue;
            return (
              <View
                key={st.seq}
                style={[s.row, board && s.boardRow]}
                onLayout={board ? (e) => scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 120), animated: false }) : undefined}>
                <Txt w={board ? 'black' : 'extrabold'} size={14} color={passed ? C.faint : C.ink} style={s.time}>
                  {st.est ? `~${st.time}` : st.time}
                </Txt>
                <View style={s.rail}>
                  <View style={[s.line, { backgroundColor: lineColor, top: i === 0 ? 18 : 0, bottom: i === stops.length - 1 ? '50%' : 0 }]} />
                  <View style={[s.dot, { borderColor: lineColor }, board && s.dotBoard]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt w={board ? 'black' : 'bold'} size={15} color={passed ? C.faint : C.text} numberOfLines={1}>
                    {n.main}
                  </Txt>
                  {board ? (
                    <Txt w="extrabold" size={12} color={C.blue}>
                      {t('boardHere')}
                    </Txt>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 38, paddingRight: 12 },
  boardRow: { backgroundColor: C.sky, borderRadius: 12, marginHorizontal: 6, minHeight: 50 },
  time: { width: 60, textAlign: 'right' },
  rail: { width: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', width: 4, borderRadius: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, backgroundColor: '#FFFFFF' },
  dotBoard: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, backgroundColor: C.blue, borderColor: '#FFFFFF' },
});
