// „Czy autobus był o czasie?”: karta na ekranie kursu („Czekam na ten autobus” → „Przyjechał”) i pasek na ekranie Start,
// gdy użytkownik na coś czeka. Logika i wysyłanie: data/punctuality.ts.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { C, shadow } from '@/constants/theme';
import { answerText, arrivedTooEarly, isReported, isWaitingFor, report, startWaiting, stopWaiting, usePunctuality, waitingTitle, type Waiting } from '@/data/punctuality';
import { t, useLang } from '@/i18n';
import { athensNow, hhmm } from '@/lib/time';

import { Icon } from './Icon';
import { Button, Txt } from './ui';

const schedText = (w: Waiting) => {
  const time = hhmm(athensNow(new Date(w.sched)).sec);
  return w.est ? t('approx', { time }) : time;
};

/** Karta na ekranie kursu: zaproszenie → czekanie → podziękowanie. */
export function WaitCard({ trip }: { trip: Waiting }) {
  useLang();
  const s = usePunctuality();
  const [thanks, setThanks] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const waiting = isWaitingFor(s, trip);

  if (thanks || (!waiting && isReported(s, trip))) {
    return (
      <View style={[s_.card, s_.thanks]}>
        <Icon name="check" size={22} color={C.green} stroke={2.6} />
        <Txt w="bold" size={14} color={C.green} style={{ flex: 1, lineHeight: 20 }}>
          {thanks ? t('waitThanks', { result: thanks }) : t('punctDone')}
        </Txt>
      </View>
    );
  }

  if (!waiting) {
    return (
      <View style={s_.card}>
        <Txt w="black" size={16} color={C.ink}>
          {t('waitAsk')}
        </Txt>
        <Txt w="semibold" size={14} color={C.text2} style={{ lineHeight: 20 }}>
          {t('waitAskBody')}
        </Txt>
        <Button title={t('waitStart')} kind="outline" icon="clock" loading={busy} onPress={async () => {
          setBusy(true);
          await startWaiting(trip).finally(() => setBusy(false));
        }} />
      </View>
    );
  }

  return (
    <View style={[s_.card, s_.active]}>
      <Txt w="black" size={16} color={C.ink}>
        {t('waitingTitle')}
      </Txt>
      <Txt w="semibold" size={14} color={C.text2}>
        {t('waitingLine', { time: schedText(trip), stop: trip.stationName })}
      </Txt>
      <Button title={t('waitArrived')} icon="check" loading={busy} onPress={async () => {
        if (arrivedTooEarly(trip)) return router.push('/punktualnosc');
        setBusy(true);
        const a = await report('arrivedNow').finally(() => setBusy(false));
        if (a) setThanks(answerText(a));
      }} />
      <View style={s_.links}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/punktualnosc')} hitSlop={8}>
          <Txt w="extrabold" size={14} color={C.blue}>
            {t('waitOther')}
          </Txt>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => stopWaiting()} hitSlop={8}>
          <Txt w="bold" size={14} color={C.muted}>
            {t('waitStop')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

/** Pasek na ekranie Start: na co czekasz, „Przyjechał” jednym dotknięciem. */
export function WaitingBanner() {
  useLang();
  const { waiting } = usePunctuality();
  const [thanks, setThanks] = useState<string | null>(null);
  if (thanks) {
    return (
      <View style={[s_.banner, s_.thanks]}>
        <Icon name="check" size={20} color={C.green} stroke={2.6} />
        <Txt w="bold" size={14} color={C.green} style={{ flex: 1 }}>
          {t('waitThanks', { result: thanks })}
        </Txt>
      </View>
    );
  }
  if (!waiting) return null;
  return (
    <View style={s_.banner}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/punktualnosc')} style={{ flex: 1, gap: 1 }}>
        <Txt w="extrabold" size={12} color={C.blue}>
          {t('waitingTitle')}
        </Txt>
        <Txt w="black" size={15} color={C.ink} numberOfLines={1}>
          {waitingTitle(waiting)}
        </Txt>
        <Txt w="semibold" size={13} color={C.text2} numberOfLines={1}>
          {t('waitingLine', { time: schedText(waiting), stop: waiting.stationName })}
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          if (arrivedTooEarly(waiting)) return router.push('/punktualnosc');
          const a = await report('arrivedNow');
          if (a) setThanks(answerText(a));
        }}
        style={({ pressed }) => [s_.arrived, pressed && { opacity: 0.85 }]}>
        <Txt w="extrabold" size={14} color="#FFFFFF">
          {t('waitArrived')}
        </Txt>
      </Pressable>
    </View>
  );
}

const s_ = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 8, marginTop: 4, ...shadow },
  active: { borderWidth: 2, borderColor: C.blue },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.greenBg },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, paddingHorizontal: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, borderWidth: 2, borderColor: C.blue, ...shadow },
  arrived: { height: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
});
