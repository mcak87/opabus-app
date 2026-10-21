// Rodzaj połączenia – czy duży rozkład (Ateny, Saloniki) można pobrać w tle bez zużywania pakietu danych komórkowych.
import { requireOptionalNativeModule } from 'expo';

/**
 * Moduł natywny z expo-network, wczytany „opcjonalnie”: wersja aplikacji zbudowana jeszcze bez niego (stary build testowy)
 * nie wysypuje się, tylko nie zna rodzaju sieci – wtedy traktujemy połączenie jak komórkowe.
 */
const ExpoNetwork = requireOptionalNativeModule<{ getNetworkStateAsync(): Promise<{ type?: string }> }>('ExpoNetwork');

/** true = Wi-Fi albo kabel. Nie wiadomo (brak modułu, błąd) = false. */
export async function onUnmeteredNetwork(): Promise<boolean> {
  try {
    const type = (await ExpoNetwork?.getNetworkStateAsync())?.type;
    return type === 'WIFI' || type === 'ETHERNET';
  } catch {
    return false;
  }
}
