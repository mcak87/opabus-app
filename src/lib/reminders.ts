// Przypomnienia – lokalne powiadomienia w telefonie (bez serwera i bez internetu), zawsze za darmo (CLAUDE.md).
// Każde przypomnienie ma nasz klucz (np. „lastBus”, „trip:rodos:123:…”) – na ekranie widać, że jest ustawione, i można je anulować.
// Android 12+: co do minuty tylko ze zgodą „Alarmy i przypomnienia” (moduł exact-alarms). Bez niej system potrafi
// opóźnić powiadomienie nawet o godzinę – wtedy prosimy o zgodę, a po jej udzieleniu przestawiamy przypomnienia na dokładne.
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { t } from '@/i18n';

import { canScheduleExact } from '../../modules/exact-alarms';

const K = 'reminders.v1';
const CHANNEL = 'reminders';

type Content = { title: string; body: string; url: string };
/** exact – ustawione jako dokładny alarm (Android); false – system może je opóźnić. */
export type Reminder = Content & { notif: string; at: number; exact: boolean };
type State = Record<string, Reminder>;

function read(): State {
  try {
    const v = JSON.parse(Storage.getItemSync(K) ?? '{}') as State;
    const now = Date.now();
    // Przypomnienia z przeszłości już nas nie interesują.
    return Object.fromEntries(Object.entries(v).filter(([, r]) => r && typeof r.notif === 'string' && r.at > now));
  } catch {
    return {};
  }
}

let state: State = read();
const listeners = new Set<() => void>();

function save(next: State) {
  state = next;
  Storage.setItemSync(K, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function useReminders(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const getReminder = (key: string): Reminder | null => (state[key] && state[key].at > Date.now() ? state[key] : null);

/** Czy przypomnienia przyjdą co do minuty (iPhone – zawsze). */
export const exactAllowed = () => Platform.OS !== 'android' || canScheduleExact();

async function schedule(at: number, c: Content): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title: c.title, body: c.body, data: { url: c.url }, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL },
  });
}

/** Po udzieleniu zgody na dokładne alarmy – przestawiamy wcześniejsze (niedokładne) przypomnienia. */
async function rescheduleInexact() {
  const todo = Object.entries(read()).filter(([, r]) => !r.exact && typeof r.title === 'string');
  if (!todo.length || !exactAllowed()) return;
  const next = { ...read() };
  for (const [key, r] of todo) {
    await Notifications.cancelScheduledNotificationAsync(r.notif).catch(() => {});
    next[key] = { ...r, notif: await schedule(r.at, r), exact: true };
  }
  save(next);
}

/** Powiadomienia także przy otwartej aplikacji; przestawianie przypomnień po powrocie z ustawień. Wywołać raz przy starcie. */
export function initReminders() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  rescheduleInexact().catch(() => {});
  AppState.addEventListener('change', (s) => {
    if (s === 'active') rescheduleInexact().catch(() => {});
  });
}

/** Zgoda „Alarmy i przypomnienia” – sprawdzana znowu po powrocie do aplikacji (np. z ustawień). */
export function useExactAllowed(): boolean {
  const [ok, setOk] = useState(exactAllowed);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setOk(exactAllowed());
    });
    return () => sub.remove();
  }, []);
  return ok;
}

/** granted – można; ask-settings – użytkownik odmówił na stałe (trzeba w ustawieniach telefonu). */
export async function ensurePermission(): Promise<'granted' | 'ask-settings'> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t('remindersChannel'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
  }
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  return perm.granted ? 'granted' : 'ask-settings';
}

/**
 * Ustawia (albo przestawia) przypomnienie o kluczu `key` na chwilę `at` (ms). `url` – ekran po dotknięciu powiadomienia.
 * past – za późno (mniej niż minuta do tej chwili).
 */
export async function setReminder(key: string, at: number, content: Content): Promise<'ok' | 'past' | 'ask-settings'> {
  if (at < Date.now() + 60_000) return 'past';
  if ((await ensurePermission()) !== 'granted') return 'ask-settings';
  const old = state[key];
  if (old) await Notifications.cancelScheduledNotificationAsync(old.notif).catch(() => {});
  const notif = await schedule(at, content);
  save({ ...read(), [key]: { ...content, notif, at, exact: exactAllowed() } });
  return 'ok';
}

export async function cancelReminder(key: string) {
  const old = state[key];
  if (!old) return;
  await Notifications.cancelScheduledNotificationAsync(old.notif).catch(() => {});
  const next = { ...state };
  delete next[key];
  save(next);
}

/** Ekran z powiadomienia (dotknięcie), także gdy aplikacja była zamknięta. */
export function reminderUrl(r: Notifications.NotificationResponse | null | undefined): string | null {
  const url = r?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
