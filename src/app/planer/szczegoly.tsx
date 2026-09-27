// Planer – szczegóły opcji (projekt: canvas „Szczegóły trasy”): oś czasu z dojściem, przejazdami, przesiadkami i celem.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { stopName } from '@/components/TripOption';
import { LineBadge, Txt } from '@/components/ui';
import { C, lineColor, shadow } from '@/constants/theme';
import { modeOf } from '@/data/queries';
import { t, useLang } from '@/i18n';
import { hhmm } from '@/lib/time';
import { duration, placeName } from '@/planner/format';
import type { Net, RideLeg, WalkLeg } from '@/planner/raptor';
import { usePlanner } from '@/planner/store';

const time = (sec: number, est: boolean) => (est ? t('approx', { time: hhmm(sec) }) : hhmm(sec));

export default function TripDetails() {
  useLang();
  const { i } = useLocalSearchParams<{ i: string }>();
  const { trip } = usePlanner();
  const o = trip?.result.options[Number(i)];
  if (!trip || !o) {
    return (
      <View style={s.screen}>
        <ScreenHeader title={t('tripDetails')} />
        <Pressable onPress={() => router.back()} style={{ padding: 24 }}>
          <Txt color={C.muted}>{t('errorGeneric')}</Txt>
        </Pressable>
      </View>
    );
  }
  const net = trip.net;
  const firstRideIdx = o.legs.findIndex((l) => l.kind === 'ride');
  const lastRideIdx = o.legs.map((l) => l.kind).lastIndexOf('ride');

  return (
    <View style={s.screen}>
      <ScreenHeader
        region={trip.region}
        kicker={t('tripDetails')}
        title={`${hhmm(o.leave)} – ${hhmm(o.arrive)}`}
        sub={`${placeName(trip.from)} → ${placeName(trip.to)} · ${duration(o.arrive - o.leave)}`}
      />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.card}>
          <Point time={hhmm(o.leave)} title={placeName(trip.from)} kicker={t('startPoint')} color={C.blue} />
          {o.legs.map((l, k) =>
            l.kind === 'walk' ? (
              l.sec >= 30 ? (
                <WalkRow key={k} text={k < firstRideIdx ? t('walkToStop', { min: mins(l) }) : k > lastRideIdx ? t('walkToDest', { min: mins(l) }) : t('walkTransfer', { min: mins(l) })} />
              ) : null
            ) : (
              <RideRows key={k} net={net} leg={l} />
            ),
          )}
          <Point time={hhmm(o.arrive)} title={placeName(trip.to)} kicker={t('destination')} color={C.orange} last />
        </View>
      </ScrollView>
    </View>
  );
}

const mins = (l: WalkLeg) => Math.max(1, Math.round(l.sec / 60));

function Point({ time: tm, title, kicker, color, last }: { time: string; title: string; kicker: string; color: string; last?: boolean }) {
  return (
    <View style={s.row}>
      <Txt w="black" size={15} color={C.ink} style={s.time} numberOfLines={1}>
        {tm}
      </Txt>
      <View style={s.rail}>
        <View style={[s.dot, { borderColor: color }]} />
        {!last ? <View style={[s.line, s.lineDashed]} /> : null}
      </View>
      <View style={s.content}>
        <Txt w="bold" size={12} color={C.muted}>
          {kicker}
        </Txt>
        <Txt w="extrabold" size={16} color={C.ink} numberOfLines={2}>
          {title}
        </Txt>
      </View>
    </View>
  );
}

function WalkRow({ text }: { text: string }) {
  return (
    <View style={s.row}>
      <View style={s.time} />
      <View style={s.rail}>
        <View style={[s.line, s.lineDashed]} />
      </View>
      <View style={[s.content, s.walkContent]}>
        <Icon name="walk" size={18} color={C.text2} />
        <Txt w="bold" size={14} color={C.text2} style={{ flex: 1 }}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

function RideRows({ net, leg }: { net: Net; leg: RideLeg }) {
  const [open, setOpen] = useState(false);
  const pat = net.patterns[leg.pattern];
  const r = net.routes.get(pat.route);
  const mode = modeOf(r?.type ?? 3);
  const color = lineColor(r?.color ?? null, r?.agencyCode ?? '', mode);
  const tripStart = leg.dep - pat.dep[leg.boardPos];
  const middle: { name: string; time: string }[] = [];
  for (let p = leg.boardPos + 1; p < leg.alightPos; p++) {
    middle.push({ name: stopName(net, pat.stops[p]), time: time(tripStart + pat.arr[p], !!pat.est[p]) });
  }
  const stops = leg.alightPos - leg.boardPos;

  return (
    <>
      <View style={s.row}>
        <Txt w="black" size={15} color={C.ink} style={s.time} numberOfLines={1}>
          {time(leg.dep, leg.depEst)}
        </Txt>
        <View style={s.rail}>
          <View style={[s.dot, { borderColor: color }]} />
          <View style={[s.line, { backgroundColor: color }]} />
        </View>
        <View style={s.content}>
          <Txt w="extrabold" size={16} color={C.ink} numberOfLines={2}>
            {stopName(net, leg.board)}
          </Txt>
          <View style={s.lineRow}>
            <LineBadge label={r?.shortName || r?.longName || '?'} color={r?.color ?? null} agencyCode={r?.agencyCode ?? ''} mode={mode} />
            <Txt w="bold" size={13} color={C.text2} style={{ flex: 1 }} numberOfLines={2}>
              {[t('towards', { headsign: pat.headsign }), r?.agencyName || r?.agencyCode].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((x) => !x)} hitSlop={6} style={s.stopsBtn}>
            <Txt w="bold" size={13} color={C.muted}>
              {t('stopsRide', { n: stops, min: Math.max(1, Math.round((leg.arr - leg.dep) / 60)) })}
              {middle.length ? ' · ' : ''}
            </Txt>
            {middle.length ? (
              <Txt w="extrabold" size={13} color={C.blue}>
                {open ? t('hideStops') : t('showStops')}
              </Txt>
            ) : null}
          </Pressable>
          {open
            ? middle.map((m, k) => (
                <View key={k} style={s.midRow}>
                  <Txt w="bold" size={13} color={C.muted} style={{ width: 70 }}>
                    {m.time}
                  </Txt>
                  <Txt w="semibold" size={13} color={C.text2} style={{ flex: 1 }} numberOfLines={1}>
                    {m.name}
                  </Txt>
                </View>
              ))
            : null}
        </View>
      </View>
      <View style={s.row}>
        <Txt w="black" size={15} color={C.ink} style={s.time} numberOfLines={1}>
          {time(leg.arr, leg.arrEst)}
        </Txt>
        <View style={s.rail}>
          <View style={[s.dot, { borderColor: color }]} />
          <View style={[s.line, s.lineDashed]} />
        </View>
        <View style={s.content}>
          <Txt w="extrabold" size={16} color={C.ink} numberOfLines={2}>
            {t('alightAt', { stop: stopName(net, leg.alight) })}
          </Txt>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 16, paddingRight: 14, ...shadow },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  time: { width: 92, paddingLeft: 12, paddingTop: 1, textAlign: 'left' },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 4, backgroundColor: '#FFFFFF', marginTop: 3, zIndex: 1 },
  line: { flex: 1, width: 4, borderRadius: 2, marginTop: -2, minHeight: 18 },
  lineDashed: { width: 0, borderLeftWidth: 3, borderStyle: 'dashed', borderColor: C.faint, backgroundColor: 'transparent' },
  content: { flex: 1, paddingLeft: 10, paddingBottom: 16, gap: 4 },
  walkContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopsBtn: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  midRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
});
