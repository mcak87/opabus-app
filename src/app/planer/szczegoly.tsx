// Planer – szczegóły opcji (projekt: canvas „Szczegóły trasy”): oś czasu z dojściem, przejazdami, przesiadkami i celem.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ReminderButton } from '@/components/ReminderButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { stopName } from '@/components/TripOption';
import { LineBadge, Txt } from '@/components/ui';
import { C, lineColor, shadow } from '@/constants/theme';
import { modeOf } from '@/data/queries';
import { getLang, pluralKey, t, useLang } from '@/i18n';
import { athensEpoch, hhmm, type ServiceDay } from '@/lib/time';
import { tripPrices, type Price } from '@/planner/fares';
import { duration, hhmmDay, patternLabel, placeName, priceText } from '@/planner/format';
import type { Net, RideLeg, WalkLeg } from '@/planner/raptor';
import { usePlanner } from '@/planner/store';

const time = (sec: number, est: boolean) => (est ? t('approx', { time: hhmmDay(sec) }) : hhmmDay(sec));

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
  const rideLegs = o.legs.filter((l): l is RideLeg => l.kind === 'ride');
  const prices = trip.fares ? tripPrices(trip.fares, net, rideLegs) : null;
  const ops = new Set((prices?.rides ?? []).map((p) => p.op).filter(Boolean));
  const ktel = Object.values(trip.fares ?? {}).find((f) => f.operators.KTEL?.label)?.operators.KTEL?.label;
  const fareLabel = ktel?.[getLang()] ?? ktel?.en;

  return (
    <View style={s.screen}>
      <ScreenHeader
        region={trip.region}
        kicker={t('tripDetails')}
        title={`${hhmm(o.leave)} – ${hhmmDay(o.arrive)}`}
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
              <RideRows key={k} net={net} leg={l} price={prices?.rides[rideLegs.indexOf(l)]} />
            ),
          )}
          <Point time={hhmmDay(o.arrive)} title={placeName(trip.to)} kicker={t('destination')} color={C.orange} last />
        </View>

        {prices ? (
          <View style={[s.card, s.fareCard]}>
            <View style={s.fareTop}>
              <Txt w="black" size={15} color={C.ink} style={{ flex: 1 }}>
                {t('fareTotal')}
              </Txt>
              <Txt w="black" size={18} color={C.ink}>
                {priceText(prices.total)}
              </Txt>
            </View>
            {ops.has('KTEL') ? (
              <Txt w="semibold" size={13} color={C.text2} style={s.fareLine}>
                {`KTEL: ${t('fareKtelBuy')}`}
              </Txt>
            ) : null}
            {ops.has('RODA') ? (
              <Txt w="semibold" size={13} color={C.text2} style={s.fareLine}>
                {`RODA: ${t('fareRodaBuy')}`}
              </Txt>
            ) : null}
            {ops.has('KTEL') && ops.has('RODA') ? (
              <Txt w="semibold" size={13} color={C.text2} style={s.fareLine}>
                {t('fareSeparate')}
              </Txt>
            ) : null}
            <Txt w="bold" size={12} color={C.muted} style={s.fareLine}>
              {[fareLabel ? t('fareSource', { label: fareLabel }) : null, prices.rides.some((p) => p.kind === 'upTo') ? t('fareUpToNote') : null].filter(Boolean).join(' ')}
            </Txt>
          </View>
        ) : null}

        {/* Przypomnienie 5 min przed wyjściem (projekt: canvas „Szczegóły trasy” – „Przypomnij 10:13”). */}
        {rideLegs[0] ? <TripReminder net={net} leave={o.leave} day={trip.result.day} ride={rideLegs[0]} firstWalk={o.legs[0]?.kind === 'walk' ? o.legs[0].sec : 0} /> : null}
      </ScrollView>
    </View>
  );
}

const mins = (l: WalkLeg) => Math.max(1, Math.round(l.sec / 60));

const LEAVE_BEFORE = 5 * 60;

function TripReminder({ net, leave, day, ride, firstWalk }: { net: Net; leave: number; day: ServiceDay; ride: RideLeg; firstWalk: number }) {
  const line = patternLabel(net, ride.pattern);
  const stop = stopName(net, ride.board);
  // Region i stacja z paczki, z której jest przystanek (sieć może łączyć kilka paczek).
  const { region, stationId } = net.stops[ride.board];
  const dep = time(ride.dep, ride.depEst);
  const walk = firstWalk >= 60;
  // Pełna minuta (wyjście liczone z dojściem ma sekundy).
  const remindSec = Math.floor((leave - LEAVE_BEFORE) / 60) * 60;
  return (
    <View style={{ marginTop: 12 }}>
      <ReminderButton
        rkey={`plan:${region}:${ride.trip}:${day.date}:${leave}`}
        at={athensEpoch(day, remindSec)}
        label={t('remindAt', { time: hhmm(remindSec) })}
        title={walk ? t('remindLeaveTitle', { min: LEAVE_BEFORE / 60 }) : t('remindDepTitle', { line, time: dep })}
        body={
          walk
            ? t('remindLeaveBody', { line, time: dep, stop, walk: Math.round(firstWalk / 60) })
            : t('remindDepBody', { stop, headsign: net.patterns[ride.pattern].headsign })
        }
        url={`/stop/${region}/${stationId}`}
      />
    </View>
  );
}

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

function RideRows({ net, leg, price }: { net: Net; leg: RideLeg; price?: Price }) {
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
            <LineBadge label={patternLabel(net, leg.pattern)} color={r?.color ?? null} agencyCode={r?.agencyCode ?? ''} mode={mode} />
            <Txt w="bold" size={13} color={C.text2} style={{ flex: 1 }} numberOfLines={2}>
              {[t('towards', { headsign: pat.headsign }), r?.agencyName || r?.agencyCode].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          {pat.boardSec ? (
            <View style={s.boardRow}>
              <Icon name="clock" size={15} color={C.orangeText} />
              <Txt w="bold" size={13} color={C.orangeText} style={{ flex: 1 }}>
                {t('ferryBoard', { min: Math.round(pat.boardSec / 60) })}
              </Txt>
            </View>
          ) : null}
          {price ? (
            <Txt w="extrabold" size={13} color={C.text2}>
              {`${t('fareTicket', { op: price.op || r?.agencyName || r?.agencyCode || '' })} · ${priceText(price)}`}
            </Txt>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((x) => !x)} hitSlop={6} style={s.stopsBtn}>
            <Txt w="bold" size={13} color={C.muted}>
              {t(pluralKey('stopsRide', stops), { n: stops, min: Math.max(1, Math.round((leg.arr - leg.dep) / 60)) })}
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
  fareCard: { marginTop: 12, paddingHorizontal: 16, gap: 6 },
  fareTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fareLine: { lineHeight: 18 },
  midRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
