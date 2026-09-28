// Zgłoszenie poprawki przystanku – wskazanie miejsca na mapie (start w obecnym położeniu przystanku).
import { router, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { t, useLang } from '@/i18n';
import { setPickedPoint } from '@/lib/pickedPoint';
import { IS_EXPO_GO } from '@/lib/runtime';

const PickMap = lazy(() => import('@/components/PickMap'));

export default function FixOnMapScreen() {
  useLang();
  const { lat, lon } = useLocalSearchParams<{ lat?: string; lon?: string }>();
  const center = lat && lon ? { lat: Number(lat), lon: Number(lon) } : undefined;

  return (
    <View style={s.screen}>
      <ScreenHeader title={t('fixMapTitle')} />
      {IS_EXPO_GO ? (
        <View style={s.note}>
          <Icon name="map" size={24} color={C.blue} />
          <Txt w="bold" size={15} color={C.text2} style={{ flex: 1, lineHeight: 21 }}>
            {t('mapNeedsBuild')}
          </Txt>
        </View>
      ) : (
        <Suspense fallback={<ActivityIndicator color={C.blue} style={{ marginTop: 40 }} />}>
          <PickMap
            center={center}
            label={t('fixSetHere')}
            onPick={(p) => {
              if (p.kind === 'point') setPickedPoint({ lat: p.lat, lon: p.lon });
              router.back();
            }}
          />
        </Suspense>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  note: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sky, borderRadius: 18, padding: 16, margin: 16 },
});
