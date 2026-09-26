// Wspólne ustawienia odczytu pozycji. Accuracy.High – potrzebujemy wiedzieć, przy którym przystanku stoisz (GPS).
// mayShowUserSettingsDialog: false – bez okna Google „Location Accuracy” (prośba o udostępnianie danych Google);
// telefon poda pozycję z tego, co ma włączone.
import { Accuracy, type LocationOptions } from 'expo-location';

export const POSITION_OPTIONS: LocationOptions = { accuracy: Accuracy.High, mayShowUserSettingsDialog: false };
