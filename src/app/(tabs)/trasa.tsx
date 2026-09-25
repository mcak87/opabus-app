// Planer trasy – w budowie (etap 3 planu: RAPTOR z kilkoma przystankami startowymi, CLAUDE.md „Planer trasy”).
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Card, PanoramaHeader, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { t, useLang } from '@/i18n';

export default function RouteScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  return (
    <View style={s.screen}>
      <PanoramaHeader height={64} style={{ paddingTop: insets.top + 14, paddingBottom: 56 }}>
        <Txt w="black" size={30} color={C.ink} style={{ paddingHorizontal: 24 }}>
          {t('routeTitle')}
        </Txt>
      </PanoramaHeader>
      <View style={s.body}>
        <Card style={s.card}>
          <Icon name="route" size={28} color={C.blue} />
          <Txt w="bold" color={C.text2} style={{ flex: 1 }}>
            {t('routeSoon')}
          </Txt>
        </Card>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
