// Połączenia z limitem czasu. Android w React Native bez limitu czeka na odpowiedź bez końca – na hotelowym Wi-Fi
// z ekranem logowania albo przy słabym zasięgu ekran kręciłby się w nieskończoność, a kolejki (np. zgłoszenia
// punktualności) stałyby do ponownego uruchomienia aplikacji. Bez zależności od React Native (testy w Node).

/** Zwykłe zapytania do opabus.com (manifest, listy, zgłoszenia). */
export const API_TIMEOUT_MS = 15_000;
/** Wysyłka zdjęcia (kilkaset KB przez słaby internet). */
export const UPLOAD_TIMEOUT_MS = 60_000;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Brak odpowiedzi serwera po ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

/**
 * fetch, który po `ms` przerywa połączenie – razem z pobieraniem treści (res.json(), res.text()): fetch z Expo (SDK 57)
 * kończy się już na nagłówkach, a treść przychodzi później i też może utknąć. Dlatego licznik nie jest zatrzymywany
 * po nagłówkach; po pełnym pobraniu odpowiedzi przerwanie niczego już nie zmienia.
 */
export async function fetchTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = API_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new TimeoutError(ms)), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.aborted) throw new TimeoutError(ms);
    throw e;
  }
}
