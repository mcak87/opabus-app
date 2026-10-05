// Przebieg kursu – wszystkie przystanki z godzinami, wyróżniony przystanek, na którym użytkownik wsiada.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ReminderButton } from '@/components/ReminderButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/ui';
import { WaitCard } from '@/components/WaitCard';
import { C } from '@/constants/theme';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { WAIT_FROM_MS, WAIT_UNTIL_MS, type Waiting } from '@/data/punctuality';
import { lineLabel as lineLabelOf, tripTimeline, type TripStop } from '@/data/queries';
import { arrow, t, useLang } from '@/i18n';

const REMIND_BEFORE_MS = 5 * 60_000;

export default function TripScreen() {
  useLang();
  /** dep – chwila odjazdu z przystanku `from` (ms), przekazana z listy odjazdów. */
  const { region, trip, from, dep } = useLocalSearchParams<{ region: string; trip: string; from?: string; dep?: string }>();
  const [stops, setStops] = useState<TripStop[] | null>(null);
  const [title, setTitle] = useState('');
  const [lineLabel, setLineLabel] = useState('');
  const [headsign, setHeadsign] = useState('');
  /** Kod linii z GTFS i kody/położenie przystanków kursu – do zgłoszenia „czy był o czasie”. */
  const [routeCode, setRouteCode] = useState('');
  const [stopInfo, setStopInfo] = useState<Map<number, { code: string; lat: number; lon: number }>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const scroll = useRef<ScrollView>(null);
  const depAt = dep && Number.isFinite(Number(dep)) ? Number(dep) : null;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      const { db } = await openRegion(region);
      const tl = await tripTimeline(db, Number(trip));
      const route = await db.all<{ short_name: string; long_name: string; headsign: string; code: string | null; type: number; agency: string | null }>(
        `SELECT r.short_name, r.long_name, p.headsign, r.code, r.type, a.name AS agency
           FROM trips t JOIN patterns p ON p.id = t.pattern_id JOIN routes r ON r.id = p.route_id LEFT JOIN agencies a ON a.id = r.agency_id
          WHERE t.id = ?`,
        [Number(trip)],
      );
      const codes = await db.all<{ id: number; code: string | null; lat: number; lon: number }>(
        'SELECT s.id, s.code, s.lat, s.lon FROM trips t JOIN pattern_stops ps ON ps.pattern_id = t.pattern_id JOIN stops s ON s.id = ps.stop_id WHERE t.id = ?',
        [Number(trip)],
      );
      const r = route[0];
      const label = r ? lineLabelOf(r.short_name, r.long_name, r.type, r.agency ?? '') : '';
      setTitle(r ? `${label} ${arrow()} ${r.headsign}` : '');
      setLineLabel(label);
      setHeadsign(r?.headsign ?? '');
      setRouteCode(r?.code ?? '');
      setStopInfo(new Map(codes.map((c) => [c.id, { code: c.code ?? '', lat: c.lat, lon: c.lon }])));
      setStops(tl);
    })();
  }, [region, trip]);

  const boardIdx = stops?.findIndex((s) => String(s.stationId) === from) ?? -1;
  const hasEst = stops?.some((s) => s.est);
  // „Czekam na ten autobus” – od godziny przed odjazdem do 45 min po (spóźnienia).
  const board = stops && boardIdx >= 0 ? stops[boardIdx] : null;
  const boardStop = board ? stopInfo.get(board.stopId) : undefined;
  const waitTrip: Waiting | null =
    board && boardStop?.code && routeCode && depAt && now > depAt - WAIT_FROM_MS && now < depAt + WAIT_UNTIL_MS
      ? {
          region,
          route: routeCode,
          stop: boardStop.code,
          line: lineLabel,
          headsign,
          stationId: board.stationId,
          stationName: stationNames(board).main,
          lat: boardStop.lat,
          lon: boardStop.lon,
          sched: depAt,
          est: board.est,
        }
      : null;

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

        {/* Przypomnienie 5 min przed odjazdem z przystanku, na którym wsiadasz (projekt: canvas „Przebieg kursu”). */}
        {stops && boardIdx >= 0 && depAt ? (
          <ReminderButton
            rkey={`trip:${region}:${trip}:${depAt}`}
            at={depAt - REMIND_BEFORE_MS}
            label={t('remindBeforeDep', { min: REMIND_BEFORE_MS / 60_000 })}
            title={t('remindDepTitle', { line: lineLabel, time: stops[boardIdx].est ? t('approx', { time: stops[boardIdx].time }) : stops[boardIdx].time })}
            body={t('remindDepBody', { stop: stationNames(stops[boardIdx]).main, headsign })}
            url={`/stop/${region}/${stops[boardIdx].stationId}`}
          />
        ) : null}

        {/* Czy autobus był o czasie? – zgłoszenie pomaga poprawić godziny w rozkładzie. */}
        {waitTrip ? <WaitCard trip={waitTrip} /> : null}
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
