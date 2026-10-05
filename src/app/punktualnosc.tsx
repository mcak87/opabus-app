// „Czy autobus był o czasie?” – odpowiedź po fakcie (z powiadomienia albo „Inna odpowiedź” na karcie kursu):
// o czasie / później / wcześniej (o ile minut) / nie przyjechał / nie wiem. Zgłoszenie anonimowe (data/punctuality.ts).
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { report, stopWaiting, usePunctuality, waitingTitle, type Answer } from '@/data/punctuality';
import { t, useLang, type Key } from '@/i18n';
import { athensNow, hhmm } from '@/lib/time';

const LATE = [2, 5, 10, 15, 20, 30, 45, 60];
const EARLY = [1, 2, 3, 5, 10];

export default function PunctualityScreen() {
  useLang();
  const { waiting } = usePunctuality();
  const [mode, setMode] = useState<'late' | 'early' | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const pick = (m: 'late' | 'early') => {
    setMode(m);
    setMinutes(null);
  };
  const send = async (a: Answer) => {
    setBusy(true);
    try {
      if (await report(a, 'later')) setDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (done || !waiting) {
    return (
      <View style={s.screen}>
        <ScreenHeader title={t('punctTitle')} />
        <View style={s.body}>
          <View style={[s.info, done && { backgroundColor: C.greenBg }]}>
            <Icon name={done ? 'check' : 'clock'} size={22} color={done ? C.green : C.blue} stroke={2.4} />
            <Txt w="bold" size={15} color={done ? C.green : C.text2} style={{ flex: 1, lineHeight: 21 }}>
              {done ? t('punctDone') : t('punctNone')}
            </Txt>
          </View>
          <Button title={t('close')} kind="outline" onPress={close} />
        </View>
      </View>
    );
  }

  const time = hhmm(athensNow(new Date(waiting.sched)).sec);
  const choices = mode === 'late' ? LATE : EARLY;

  return (
    <View style={s.screen}>
      <ScreenHeader region={waiting.region} title={t('punctTitle')} sub={`${waitingTitle(waiting)} · ${waiting.est ? t('approx', { time }) : time}`} />
      <ScrollView contentContainerStyle={s.body}>
        <Txt w="semibold" size={14} color={C.text2} style={{ paddingHorizontal: 4 }}>
          {t('waitingLine', { time: waiting.est ? t('approx', { time }) : time, stop: waiting.stationName })}
        </Txt>

        <Choice icon="check" label="punctOnTime" color={C.green} onPress={() => send({ kind: 'ok', delta: 0 })} disabled={busy} />
        <Choice icon="clock" label="punctLate" color={C.orange} selected={mode === 'late'} onPress={() => pick('late')} disabled={busy} />
        <Choice icon="refresh" label="punctEarly" color={C.blue} selected={mode === 'early'} onPress={() => pick('early')} disabled={busy} />

        {mode ? (
          <View style={s.card}>
            <Txt w="black" size={15} color={C.ink}>
              {t('punctHowMuch')}
            </Txt>
            <View style={s.chips}>
              {choices.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: minutes === m }}
                  onPress={() => setMinutes(m)}
                  style={[s.chip, minutes === m && s.chipOn]}>
                  <Txt w="extrabold" size={15} color={minutes === m ? '#FFFFFF' : C.ink}>
                    {`${m} min`}
                  </Txt>
                </Pressable>
              ))}
            </View>
            <Button
              title={t('punctSend')}
              disabled={minutes === null}
              loading={busy}
              onPress={() => minutes !== null && send({ kind: 'ok', delta: mode === 'late' ? minutes : -minutes })}
            />
          </View>
        ) : null}

        <Choice icon="x" label="punctMissed" color={C.orangeText} onPress={() => send({ kind: 'no' })} disabled={busy} />
        <Pressable accessibilityRole="button" onPress={() => stopWaiting().then(close)} hitSlop={8} style={s.unknown}>
          <Txt w="bold" size={15} color={C.muted}>
            {t('punctUnknown')}
          </Txt>
        </Pressable>

        <Txt w="semibold" size={12} color={C.muted} style={{ textAlign: 'center', marginTop: 4 }}>
          {t('punctPrivacy')}
        </Txt>
      </ScrollView>
    </View>
  );
}

function Choice({ icon, label, color, selected, onPress, disabled }: { icon: IconName; label: Key; color: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.choice, selected && { borderColor: color }, pressed && { opacity: 0.85 }]}>
      <View style={[s.choiceIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={22} color="#FFFFFF" stroke={2.4} />
      </View>
      <Txt w="black" size={17} color={C.ink} style={{ flex: 1 }}>
        {t(label)}
      </Txt>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sky, borderRadius: 16, padding: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 12, ...shadow },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, borderWidth: 2, borderColor: 'transparent', ...shadow },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 64, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.blue },
  unknown: { alignSelf: 'center', paddingVertical: 10 },
});
