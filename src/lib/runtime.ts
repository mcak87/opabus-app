// Gdzie działa aplikacja. Expo Go nie ma modułów spoza Expo SDK (np. mapy MapLibre) – wtedy pokazujemy zastępczy komunikat.
import Constants, { ExecutionEnvironment } from 'expo-constants';

export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
