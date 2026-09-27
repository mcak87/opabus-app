// Wspólny odczyt pozycji. Accuracy.High – potrzebujemy wiedzieć, przy którym przystanku stoisz (GPS).
// mayShowUserSettingsDialog: false – bez okna Google „Location Accuracy” (prośba o udostępnianie danych Google);
// telefon poda pozycję z tego, co ma włączone.
import { Accuracy, getCurrentPositionAsync, type LocationObject, type LocationOptions } from 'expo-location';

export const POSITION_OPTIONS: LocationOptions = { accuracy: Accuracy.High, mayShowUserSettingsDialog: false };

/** Bieżąca pozycja albo null po `ms` – w budynku GPS potrafi szukać bardzo długo, a ekran nie może czekać bez końca. */
export function currentPosition(ms = 12_000): Promise<LocationObject | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([getCurrentPositionAsync(POSITION_OPTIONS).catch(() => null), timeout]);
}
