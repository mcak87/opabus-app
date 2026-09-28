// Karta opcji planera (projekt: canvas „Wyniki”): etykiety, godziny, przebieg (pieszo → linia → pieszo), pierwszy odjazd.
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { C, shadow } from '@/constants/theme';
import { modeOf } from '@/data/queries';
import { t, type Key } from '@/i18n';
import { hhmm } from '@/lib/time';
import { duration, modeName } from '@/planner/format';
import type { Label, Option } from '@/planner/plan';
import type { Net, RideLeg } from '@/planner/raptor';

import { Icon } from './Icon';
import { LineBadge, Txt } from './ui';

const LABEL: Record<Label, { key: Key; bg: string; fg: string }> = {
  earliest: { key: 'labelEarliest', bg: C.greenBg, fg: C.green },
  fastest: { key: 'labelFastest', bg: C.greenBg, fg: C.green },
  direct: { key: 'labelDirect', bg: C.sky, fg: C.blue },
  lessWalk: { key: 'labelLessWalk', bg: C.orangeBg, fg: C.orangeText },
  cheapest: { key: 'labelCheapest', bg: C.greenBg, fg: C.green },
};

export const stopName = (net: Net, i: number) => {
  const s = net.stops[i];
  return s.nameEn && s.nameEn !== s.name ? s.nameEn : s.name;
};

export function TripOption({
  net,
  o,
  nowSec,
  price,
  extraLabels = [],
  onPress,
}: {
  net: Net;
  o: Option;
  nowSec: number | null;
  /** Cena biletów (tekst) – gdy region ma cennik. */
  price?: string;
  extraLabels?: Label[];
  onPress: () => void;
}) {
  const rides = o.legs.filter((l): l is RideLeg => l.kind === 'ride');
  const first = rides[0];
  const inMin = first && nowSec !== null ? Math.round((first.dep - nowSec) / 60) : null;
  const firstRoute = first ? net.routes.get(net.patterns[first.pattern].route) : undefined;
  const highlight = o.labels.includes('earliest');

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, highlight && s.cardOn, pressed && { opacity: 0.85 }]}>
      <View style={s.top}>
        <View style={s.labels}>
          {[...o.labels, ...extraLabels].map((l) => (
            <View key={l} style={[s.label, { backgroundColor: LABEL[l].bg }]}>
              <Txt w="black" size={12} color={LABEL[l].fg}>
                {t(LABEL[l].key)}
              </Txt>
            </View>
          ))}
        </View>
        <Txt w="black" size={15} color={C.ink}>
          {duration(o.arrive - o.leave)}
        </Txt>
      </View>
      <Txt w="black" size={24} color={C.ink}>
        {hhmm(o.leave)} – {hhmm(o.arrive)}
      </Txt>
      <View style={s.chainRow}>
        <View style={s.chain}>
          {o.legs.map((l, i) => {
            if (l.kind === 'walk' && l.sec < 30) return null;
            const el =
              l.kind === 'walk' ? (
                <View style={s.walk}>
                  <Icon name="walk" size={15} color={C.text2} stroke={2.2} />
                  <Txt w="extrabold" size={13} color={C.text2}>
                    {Math.max(1, Math.round(l.sec / 60))}
                  </Txt>
                </View>
              ) : (
                (() => {
                  const pat = net.patterns[l.pattern];
                  const r = net.routes.get(pat.route);
                  return <LineBadge label={r?.shortName || r?.longName || '?'} color={r?.color ?? null} agencyCode={r?.agencyCode ?? ''} mode={modeOf(r?.type ?? 3)} />;
                })()
              );
            return (
              <Fragment key={i}>
                {i > 0 && !(o.legs[i - 1].kind === 'walk' && (o.legs[i - 1] as { sec: number }).sec < 30) ? (
                  <Icon name="chevronR" size={13} color={C.faint} stroke={2.6} />
                ) : null}
                {el}
              </Fragment>
            );
          })}
        </View>
        {price ? (
          <Txt w="extrabold" size={14} color={C.text2} style={s.price}>
            {price}
          </Txt>
        ) : null}
      </View>
      {first ? (
        <Txt w="bold" size={13} color={C.muted}>
          {t('firstRide', {
            mode: modeName(firstRoute?.type ?? 3),
            time: first.depEst ? t('approx', { time: hhmm(first.dep) }) : hhmm(first.dep),
            stop: stopName(net, first.board),
          })}
          {inMin !== null && inMin >= 0 && inMin < 180 ? (
            <Txt w="black" size={13} color={C.blue}>
              {' · '}
              {inMin === 0 ? t('now') : t('inMin', { min: inMin })}
            </Txt>
          ) : null}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 10, borderWidth: 2, borderColor: 'transparent', ...shadow },
  cardOn: { borderColor: C.blue },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  label: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chain: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  price: { textAlign: 'right', maxWidth: 140 },
  walk: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: C.lineSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
});
