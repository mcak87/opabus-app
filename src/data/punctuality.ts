// „Czy autobus był o czasie?” – użytkownik zaznacza, że czeka na kurs, a gdy autobus przyjedzie – jednym dotknięciem
// zapisuje różnicę względem rozkładu (albo odpowiada później, z powiadomienia). Zgłoszenia są anonimowe (bez konta i
// położenia – tylko informacja, czy telefon był przy przystanku) i trafiają do panelu /admin/punktualnosc na stronie,
// gdzie służą do poprawiania godzin w rozkładach (zwłaszcza szacunkowych „ok.”). Bez internetu czekają w kolejce.
import * as Location from 'expo-location';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { APP_VERSION } from '@/data/appConfig';
import { recordContribution } from '@/data/badges';
import { DATA_URL } from '@/data/packages';
import { arrow, getLang, t } from '@/i18n';
import { distanceM } from '@/lib/geo';
import { cancelReminder, setReminder } from '@/lib/reminders';
import { athensNow, hhmm } from '@/lib/time';

/** Kurs, na który czekasz (jeden naraz). `sched` – odjazd z przystanku wg rozkładu (ms). */
export type Waiting = {
  region: string;
  /** route_id i stop_id z GTFS – stałe między wersjami paczek (numery w paczce się zmieniają). */
  route: string;
  stop: string;
  line: string;
  headsign: string;
  stationId: number;
  stationName: string;
  lat: number;
  lon: number;
  sched: number;
  est: boolean;
};
export type Answer = { kind: 'ok'; delta: number } | { kind: 'no' };

const K_WAIT = 'punct.waiting.v1';
const K_QUEUE = 'punct.queue.v1';
const K_DONE = 'punct.done.v1';
const REMINDER = 'punct';
/** Pytanie z powiadomienia, gdy nikt nie nacisnął „Przyjechał”. */
const ASK_AFTER_MS = 30 * 60_000;
/** Czekanie wygasa po kilku godzinach (nikt już nie pamięta, o której przyjechał). */
const EXPIRE_MS = 6 * 3600_000;
/** „Czekam” – od godziny przed odjazdem do 45 min po (spóźnienia). */
export const WAIT_FROM_MS = 60 * 60_000;
export const WAIT_UNTIL_MS = 45 * 60_000;
const NEAR_M = 300;

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = Storage.getItemSync(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

type State = { waiting: Waiting | null; done: string[] };
const fresh = (w: Waiting | null) => (w && Date.now() < w.sched + EXPIRE_MS ? w : null);
let state: State = { waiting: fresh(readJson<Waiting | null>(K_WAIT, null)), done: readJson<string[]>(K_DONE, []) };
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePunctuality(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Ten sam kurs (do „czekasz na ten autobus” i „już zgłoszone”). */
export const tripKey = (w: Pick<Waiting, 'route' | 'stop' | 'sched'>) => `${w.route}|${w.stop}|${w.sched}`;
export const isWaitingFor = (s: State, w: Pick<Waiting, 'route' | 'stop' | 'sched'>) => !!s.waiting && tripKey(s.waiting) === tripKey(w);
export const isReported = (s: State, w: Pick<Waiting, 'route' | 'stop' | 'sched'>) => s.done.includes(tripKey(w));

/** Czy telefon jest przy przystanku (ostatnie znane położenie, bez czekania na GPS). null – nie wiadomo. */
async function nearStop(w: Waiting): Promise<boolean | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    if (!pos) return null;
    return distanceM(pos.coords.latitude, pos.coords.longitude, w.lat, w.lon) <= NEAR_M;
  } catch {
    return null;
  }
}

/** „Czekam na ten autobus” – zapamiętuje kurs i ustawia pytanie z powiadomienia na wypadek, gdyby nikt nie odpowiedział. */
export async function startWaiting(w: Waiting) {
  Storage.setItemSync(K_WAIT, JSON.stringify(w));
  update({ waiting: w });
  const time = w.est ? t('approx', { time: hhmm(athensNow(new Date(w.sched)).sec) }) : hhmm(athensNow(new Date(w.sched)).sec);
  await setReminder(REMINDER, Math.max(w.sched + ASK_AFTER_MS, Date.now() + 5 * 60_000), {
    title: t('punctNotifTitle', { line: w.line, time }),
    body: t('punctNotifBody', { stop: w.stationName }),
    url: '/punktualnosc',
  }).catch(() => 'past');
}

export async function stopWaiting() {
  Storage.removeItemSync(K_WAIT);
  update({ waiting: null });
  await cancelReminder(REMINDER).catch(() => {});
}

/**
 * „Przyjechał” ponad 15 min przed godziną z rozkładu – to raczej wcześniejszy kurs tej samej linii, nie ten.
 * Wtedy nie zapisujemy różnicy z zegara, tylko pytamy (ekran /punktualnosc).
 */
export const arrivedTooEarly = (w: Waiting) => Date.now() < w.sched - 15 * 60_000;

/** Różnica do pokazania: „o czasie”, „4 min później”, „2 min wcześniej”, „nie przyjechał”. */
export function answerText(a: Answer): string {
  if (a.kind === 'no') return t('deltaMissed');
  if (Math.abs(a.delta) <= 1) return t('deltaOnTime');
  return a.delta > 0 ? t('deltaLate', { min: a.delta }) : t('deltaEarly', { min: -a.delta });
}

/** Zapisuje odpowiedź dla kursu, na który czekasz. live – naciśnięte „Przyjechał” przy autobusie (różnica z zegara). */
export async function report(answer: Answer | 'arrivedNow', source: 'live' | 'later' = 'live'): Promise<Answer | null> {
  const w = state.waiting;
  if (!w) return null;
  const a: Answer = answer === 'arrivedNow' ? { kind: 'ok', delta: Math.round((Date.now() - w.sched) / 60_000) } : answer;
  const at = athensNow(new Date(w.sched));
  const d = String(at.date);
  const body = {
    region: w.region,
    route: w.route,
    stop: w.stop,
    line: w.line,
    headsign: w.headsign,
    stopName: w.stationName,
    sched: hhmm(at.sec),
    date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    weekday: at.weekday,
    kind: a.kind,
    delta: a.kind === 'ok' ? a.delta : 0,
    near: await nearStop(w),
    est: w.est,
    source,
    app: APP_VERSION,
    lang: getLang(),
  };
  const queue = [...readJson<unknown[]>(K_QUEUE, []), body].slice(-50);
  Storage.setItemSync(K_QUEUE, JSON.stringify(queue));
  const done = [...state.done.filter((k) => k !== tripKey(w)), tripKey(w)].slice(-50);
  Storage.setItemSync(K_DONE, JSON.stringify(done));
  update({ done });
  await stopWaiting();
  flushReports().catch(() => {});
  return a;
}

/** Wysyła zgłoszenia z kolejki (przy starcie aplikacji i po każdym zgłoszeniu). */
export async function flushReports() {
  const queue = readJson<unknown[]>(K_QUEUE, []);
  if (!queue.length) return;
  const left: unknown[] = [];
  for (const body of queue) {
    try {
      const res = await fetch(`${DATA_URL}/api/punctuality`, { method: 'POST', body: JSON.stringify(body) });
      // Przyjęte zgłoszenie liczy się do odznak (tylko w telefonie).
      if (res.ok) {
        const b = body as { region?: string; date?: string };
        recordContribution({ kind: 'report', region: b.region ?? '', date: b.date });
      }
      // 400 – serwer odrzucił (np. za stare zgłoszenie): nie ponawiamy.
      if (!res.ok && res.status !== 400) left.push(body);
    } catch {
      left.push(body);
    }
  }
  Storage.setItemSync(K_QUEUE, JSON.stringify(left));
}

/** Opis kursu w karcie: „40 → Rodos”. */
export const waitingTitle = (w: Waiting) => `${w.line} ${arrow()} ${w.headsign}`;
