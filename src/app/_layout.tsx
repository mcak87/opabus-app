import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { DefaultTheme, router, Stack, ThemeProvider, useRootNavigationState, type ErrorBoundaryProps, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UpdateOverlay } from '@/components/AppNotices';
import { BadgeCelebration } from '@/components/BadgeCelebration';
import { Icon } from '@/components/Icon';
import { Button, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { DataProvider } from '@/data/DataContext';
import { sendErrorReport } from '@/data/errorReport';
import { t, useLang } from '@/i18n';
import { installGlobalErrorHandler, logError } from '@/lib/errorLog';
import { checkInstallReferrer } from '@/lib/installReferrer';
import { initReminders, reminderUrl } from '@/lib/reminders';
import { useSettings } from '@/lib/settings';
import { onShare, takeInitialShare } from '@/lib/share';

SplashScreen.preventAutoHideAsync();
installGlobalErrorHandler();
initReminders();

/**
 * Awaria ekranu (błąd w kodzie): zamiast pustego ekranu komunikat, „Spróbuj ponownie” (rysuje aplikację od nowa)
 * i raport mailem. Błąd trafia do dziennika w telefonie (lib/errorLog). Działa poza DataProvider – bez useData.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useLang();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    logError('screen', error, { stack: true });
    SplashScreen.hideAsync().catch(() => {});
  }, [error]);
  return (
    <View style={[s.crash, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <StatusBar style="dark" />
      <View style={s.crashIcon}>
        <Icon name="bus" size={34} color="#FFFFFF" stroke={2.2} />
      </View>
      <Txt w="black" size={26} color={C.ink}>
        {t('crashTitle')}
      </Txt>
      <Txt w="semibold" size={16} color={C.text2} style={{ lineHeight: 23 }}>
        {t('crashBody')}
      </Txt>
      <Button title={t('retry')} icon="refresh" onPress={retry} style={{ marginTop: 8 }} />
      <Button title={t('errorReportTitle')} icon="mail" kind="text" onPress={() => sendErrorReport()} />
    </View>
  );
}

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

  // „Udostępnij → OpaBus” z Google Maps / Bookingu (Android): ekran z położeniem udostępnionego miejsca.
  useEffect(() => {
    if (!loaded || !navReady) return;
    const open = (text: string | null) => text && router.push({ pathname: '/udostepnij', params: { text } });
    open(takeInitialShare());
    const sub = onShare(open);
    return () => sub.remove();
  }, [loaded, navReady]);

  // Dotknięcie przypomnienia: ekran przystanku (albo Start) – także gdy aplikacja była zamknięta.
  useEffect(() => {
    if (!loaded || !navReady) return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = reminderUrl(r);
      if (!url) return;
      Notifications.clearLastNotificationResponse();
      if (url !== '/') router.push(url as Href);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
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
        <BadgeCelebration enabled={onboarded} />
      </DataProvider>
    </ThemeProvider>
  );
}

const s = StyleSheet.create({
  crash: { flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: 24, backgroundColor: C.bg },
  crashIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});
