// Instalacja z kodu QR (Android): Google Play przekazuje referrer z linku na stronie /s/…
// (utm_source=qr&utm_medium=partner|stop&utm_campaign=<kod partnera>&region=<region>&stop=<przystanek>).
// Przy pierwszym uruchomieniu: anonimowe zdarzenie install_android dla partnera i od razu odjazdy z tego przystanku.
// Sprawdzamy raz na instalację (klucz znika razem z aplikacją); iPhone nie ma takiego mechanizmu.
import * as Application from 'expo-application';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import { DATA_URL } from '@/data/packages';
import { referrerTarget } from '@/lib/referrer';
import { IS_EXPO_GO } from '@/lib/runtime';

const K_DONE = 'install.referrer.v1';
/** Kod partnera czekający na wysłanie (pierwsze uruchomienie bywa bez internetu). */
const K_PENDING = 'install.referrer.pendingHit.v1';
const MAX_TRIES = 3;

async function sendPendingHit() {
  const h = Storage.getItemSync(K_PENDING);
  if (!h) return;
  try {
    const res = await fetch(`${DATA_URL}/api/hit`, { method: 'POST', body: JSON.stringify({ e: 'install_android', h }) });
    if (res.ok || res.status === 400) Storage.removeItemSync(K_PENDING);
  } catch {
    // bez internetu – spróbujemy przy kolejnym uruchomieniu
  }
}

/** Zwraca ścieżkę ekranu do otwarcia (odjazdy z przystanku z plakatu) albo null. */
export async function checkInstallReferrer(): Promise<string | null> {
  if (Platform.OS !== 'android' || IS_EXPO_GO) return null;
  sendPendingHit();
  const done = Storage.getItemSync(K_DONE);
  if (done === 'done' || Number(done) >= MAX_TRIES) return null;
  let ref: string;
  try {
    ref = await Application.getInstallReferrerAsync();
  } catch {
    // Brak Sklepu Play albo chwilowy błąd – spróbujemy przy kolejnym uruchomieniu (najwyżej kilka razy).
    Storage.setItemSync(K_DONE, String((Number(done) || 0) + 1));
    return null;
  }
  Storage.setItemSync(K_DONE, 'done');
  const { hit, path } = referrerTarget(ref ?? '');
  if (hit) {
    Storage.setItemSync(K_PENDING, hit);
    sendPendingHit();
  }
  return path;
}
