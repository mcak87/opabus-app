import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { DefaultTheme, router, Stack, ThemeProvider, useRootNavigationState, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { UpdateOverlay } from '@/components/AppNotices';
import { C } from '@/constants/theme';
import { DataProvider } from '@/data/DataContext';
import { useLang } from '@/i18n';
import { checkInstallReferrer } from '@/lib/installReferrer';
import { useSettings } from '@/lib/settings';

SplashScreen.preventAutoHideAsync();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.blue, text: C.text } };

export default function RootLayout() {
  const [loaded] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const lang = useLang();
  const { onboarded } = useSettings();
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Instalacja z kodu QR na plakacie (Android): od razu odjazdy z tego przystanku, gdy nawigacja jest gotowa.
  useEffect(() => {
    if (!loaded || !navReady) return;
    checkInstallReferrer()
      .then((path) => path && router.push(path as Href))
      .catch(() => {});
  }, [loaded, navReady]);

  if (!loaded) return null;

  return (
    <ThemeProvider value={theme}>
      <DataProvider>
        <StatusBar style="dark" />
        <Stack key={lang} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          {/* Ekran powitalny tylko przy pierwszym uruchomieniu; linki z kodów QR (s/…) i odjazdy działają zawsze. */}
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="witaj" />
          </Stack.Protected>
          <Stack.Screen name="stop/[region]/[station]" />
          <Stack.Screen name="trip/[region]/[trip]" />
          <Stack.Screen name="s/[region]/[stops]" />
        </Stack>
        <UpdateOverlay />
      </DataProvider>
    </ThemeProvider>
  );
}
