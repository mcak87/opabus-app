// Przycisk „Przypomnij …” (projekt: canvas „Przebieg kursu” i „Szczegóły trasy”). Po ustawieniu pokazuje godzinę
// przypomnienia i pozwala je anulować; bez zgody na powiadomienia – podpowiedź z linkiem do ustawień telefonu.
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { C } from '@/constants/theme';
import { t, useLang, type Key } from '@/i18n';
import { cancelReminder, setReminder, useExactAllowed, useReminders } from '@/lib/reminders';

import { openExactAlarmSettings } from '../../modules/exact-alarms';
import { athensNow, hhmm } from '@/lib/time';

import { Icon } from './Icon';
import { Button, Txt } from './ui';

export function ReminderButton({
  rkey,
  at,
  label,
  title,
  body,
  url,
}: {
  /** Klucz przypomnienia (jedno na kurs / trasę). */
  rkey: string;
  /** Chwila przypomnienia (ms). */
  at: number;
  label: string;
  title: string;
  body: string;
  url: string;
}) {
  useLang();
  const reminders = useReminders();
  const [msg, setMsg] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const set = reminders[rkey] && reminders[rkey].at > now ? reminders[rkey] : null;

  if (!set && at < now + 60_000) return null; // za późno na przypomnienie

  const onPress = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await setReminder(rkey, at, { title, body, url });
      if (r === 'past') setMsg('remindTooLate');
      else if (r === 'ask-settings') setMsg('remindNoPermission');
    } catch {
      setMsg('errorGeneric');
    } finally {
      setBusy(false);
    }
  };

  if (set) {
    return (
      <View style={{ gap: 8 }}>
        <View style={s.set}>
          <Icon name="bell" size={20} color={C.green} fill={C.greenBg} stroke={2.2} />
          <Txt w="extrabold" size={15} color={C.green} style={{ flex: 1 }}>
            {t('remindSet', { time: hhmm(athensNow(new Date(set.at)).sec) })}
          </Txt>
          <Pressable accessibilityRole="button" onPress={() => cancelReminder(rkey)} hitSlop={8}>
            <Txt w="extrabold" size={14} color={C.blue}>
              {t('remindCancel')}
            </Txt>
          </Pressable>
        </View>
        <ExactAlarmHint />
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Button title={label} kind="outline" icon="bell" loading={busy} onPress={onPress} />
      {msg ? (
        <View style={s.msg}>
          <Txt w="bold" size={13} color={C.orangeText} style={{ flex: 1, lineHeight: 18 }}>
            {t(msg)}
          </Txt>
          {msg === 'remindNoPermission' ? (
            <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} hitSlop={8}>
              <Txt w="extrabold" size={13} color={C.blue}>
                {t('openSettings')}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Android bez zgody „Alarmy i przypomnienia” – przypomnienie mogłoby przyjść za późno. */
export function ExactAlarmHint() {
  useLang();
  const ok = useExactAllowed();
  if (ok) return null;
  return (
    <View style={s.hint}>
      <Icon name="clock" size={20} color={C.orangeText} />
      <Txt w="bold" size={13} color={C.orangeDeep} style={{ flex: 1, lineHeight: 18 }}>
        {t('remindExactHint')}
      </Txt>
      <Pressable accessibilityRole="button" onPress={() => openExactAlarmSettings()} hitSlop={8}>
        <Txt w="extrabold" size={14} color={C.blue}>
          {t('remindExactAllow')}
        </Txt>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: C.orangeBg, borderWidth: 1, borderColor: C.orangeLine },
  set: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: C.greenBg },
  msg: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
});
