// Moduł lokalny (tylko Android): tekst z „Udostępnij → OpaBus”. iPhone i Expo Go – brak (null, bez zdarzeń).
import { requireOptionalNativeModule } from 'expo';

type Sub = { remove(): void };
type Native = { takeInitialShare(): string | null; addListener(event: 'onShare', cb: (e: { text: string }) => void): Sub };
const M = requireOptionalNativeModule<Native>('ShareIntake');

/** Tekst udostępnienia, które uruchomiło aplikację (raz). */
export const takeInitialShare = (): string | null => M?.takeInitialShare() ?? null;
/** Udostępnienia, gdy aplikacja już działa. */
export function onShare(cb: (text: string) => void): Sub {
  return M ? M.addListener('onShare', (e) => cb(e.text)) : { remove() {} };
}
