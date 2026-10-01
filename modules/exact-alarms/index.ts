// Moduł lokalny (tylko Android): zgoda „Alarmy i przypomnienia”. iPhone i Expo Go – zawsze „można”.
import { requireOptionalNativeModule } from 'expo';

const M = requireOptionalNativeModule<{ canScheduleExact(): boolean; openSettings(): boolean }>('ExactAlarms');

/** Czy przypomnienia przyjdą co do minuty. */
export const canScheduleExact = (): boolean => M?.canScheduleExact() ?? true;
/** Ekran ustawień „Alarmy i przypomnienia” dla OpaBus. */
export const openExactAlarmSettings = (): boolean => M?.openSettings() ?? false;
