import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { C, F } from '@/constants/theme';
import { t, useLang } from '@/i18n';

function tabIcon(name: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={24} color={String(color)} stroke={focused ? 2.6 : 2} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  useLang();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.blue,
        tabBarInactiveTintColor: C.tabInactive,
        tabBarLabelStyle: { fontFamily: F.extrabold, fontSize: 12 },
        tabBarStyle: { borderTopColor: C.line, backgroundColor: '#FFFFFF' },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabStart'), tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="przystanki" options={{ title: t('tabStops'), tabBarIcon: tabIcon('pin') }} />
      <Tabs.Screen name="trasa" options={{ title: t('tabRoute'), tabBarIcon: tabIcon('route') }} />
      <Tabs.Screen name="profil" options={{ title: t('tabProfile'), tabBarIcon: tabIcon('user') }} />
    </Tabs>
  );
}
