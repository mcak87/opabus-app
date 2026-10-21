// Dziennik błędów w telefonie (na betę): ostatnie wpisy – czas, miejsce w aplikacji, komunikat. Bez danych osobowych:
// bez położenia (liczby wyglądające na współrzędne są wycinane), bez tekstów wpisywanych przez użytkownika.
// Nic nie wychodzi z telefonu samo – użytkownik wysyła raport mailem (Profil → „Wyślij raport błędów” albo ekran awarii).
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Linking, Platform, Share } from 'react-native';

export type ErrorEntry = { at: string; where: string; msg: string; /** ile razy z rzędu ten sam błąd */ n?: number };

const K_LOG = 'errors.log.v1';
const MAX_ENTRIES = 50;
const MAX_MSG = 400;
export const REPORT_EMAIL = 'wspolpraca@opabus.com';

function read(): ErrorEntry[] {
  try {
    const v = Storage.getItemSync(K_LOG);
    const list = v ? (JSON.parse(v) as unknown) : [];
    return Array.isArray(list) ? list.filter((e): e is ErrorEntry => !!e && typeof e.where === 'string' && typeof e.msg === 'string') : [];
  } catch {
    return [];
  }
}

let entries: ErrorEntry[] = read();
const listeners = new Set<() => void>();

/** Liczby z co najmniej 4 miejscami po przecinku to zwykle współrzędne – nie zapisujemy ich. */
const clean = (s: string) =>
  s
    .replace(/-?\d{1,3}\.\d{4,}/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MSG);

function describe(e: unknown, withStack: boolean): string {
  if (!(e instanceof Error)) return String(e);
  const head = e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message;
  // Awaria ekranu: kilka pierwszych ramek stosu – sam komunikat („undefined is not a function”) niewiele mówi.
  const frames =
    withStack && e.stack
      ? e.stack
          .split('\n')
          .slice(1, 4)
          .map((l) => l.replace(/\s*\((?:https?|file):[^)]*\)/g, '').trim())
      : [];
  return [head, ...frames].join(' | ');
}

/**
 * Zapisuje błąd w dzienniku. `where` – krótka nazwa miejsca (np. „install rodos”, „manifest”, „screen”).
 * Ten sam błąd kilka razy z rzędu (np. brak internetu przy każdym sprawdzeniu) to jeden wpis z licznikiem.
 */
export function logError(where: string, e: unknown, opts?: { stack?: boolean }) {
  if (__DEV__) console.log(`[błąd: ${where}]`, e);
  try {
    const msg = clean(describe(e, !!opts?.stack));
    const at = new Date().toISOString();
    const last = entries[entries.length - 1];
    entries =
      last && last.where === where && last.msg === msg
        ? [...entries.slice(0, -1), { ...last, at, n: (last.n ?? 1) + 1 }]
        : [...entries, { at, where, msg }].slice(-MAX_ENTRIES);
    Storage.setItemSync(K_LOG, JSON.stringify(entries));
    listeners.forEach((l) => l());
  } catch {
    // dziennik nie może sam wywołać kolejnej awarii
  }
}

/** Liczba wpisów w dzienniku (Profil). */
export function useErrorCount(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => entries.length,
  );
}

/**
 * Awarie poza ekranami (np. błąd w obsłudze dotknięcia) – zapis w dzienniku, potem dotychczasowa obsługa
 * (w wersji testowej czerwony ekran, w sklepowej zamknięcie aplikacji). Wywołać raz, przy starcie.
 */
export function installGlobalErrorHandler() {
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    logError(isFatal ? 'fatal' : 'js', error, { stack: true });
    previous(error, isFatal);
  });
}

/**
 * Raport mailem na REPORT_EMAIL: krótki opis od użytkownika (pole na górze), wersja aplikacji, system, język,
 * rozkłady w telefonie i wpisy z dziennika (najnowsze na górze). Bez aplikacji pocztowej – systemowe „Udostępnij”.
 */
export async function mailErrorReport(opts: { intro: string; appVersion: string; lang: string; regions: string[] }) {
  const lines = [
    opts.intro,
    '',
    '',
    '---',
    `OpaBus ${opts.appVersion} · ${Platform.OS} ${String(Platform.Version)} · ${opts.lang}`,
    `Regions: ${opts.regions.join(', ') || '–'}`,
    '',
    ...(entries.length
      ? [...entries].reverse().map((e) => `${e.at.slice(0, 19).replace('T', ' ')} UTC · ${e.where}${e.n && e.n > 1 ? ` (×${e.n})` : ''} · ${e.msg}`)
      : ['(no errors recorded)']),
  ];
  // Adres mailto ma ograniczoną długość – przy pełnym dzienniku ucinamy najstarsze wpisy.
  let body = lines.join('\n');
  if (body.length > 6000) body = `${body.slice(0, 6000)}\n…`;
  const subject = `OpaBus ${opts.appVersion} – error report (${Platform.OS})`;
  try {
    await Linking.openURL(`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  } catch {
    await Share.share({ title: subject, message: `${REPORT_EMAIL}\n\n${body}` }).catch(() => {});
  }
}
