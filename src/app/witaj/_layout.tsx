// Ekran powitalny: język → lokalizacja → region. Pokazywany tylko przy pierwszym uruchomieniu.
import { Stack } from 'expo-router';

import { C } from '@/constants/theme';

export default function WelcomeLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
