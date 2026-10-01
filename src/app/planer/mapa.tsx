// Planer – wskazanie punktu „Skąd” / „Dokąd” na mapie (field=lodging – „Mój nocleg”). W Expo Go mapy nie ma (komunikat).
import { router, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { setLodgingAt } from '@/data/lodging';
import { t, useLang } from '@/i18n';
import { IS_EXPO_GO } from '@/lib/runtime';
import { addRecent, setFrom, setTo, type Place } from '@/planner/store';

const PickMap = lazy(() => import('@/components/PickMap'));

export default function PickOnMapScreen() {
  useLang();
  const data = useData();
  const { field } = useLocalSearchParams<{ field: 'from' | 'to' | 'lodging' }>();
  const [outside, setOutside] = useState(false);

  const onPick = async (p: Place) => {
    if (field === 'lodging') {
      if (p.kind !== 'point') return;
      if (await setLodgingAt(p, data.manifest?.packages ?? [])) router.dismiss(2);
      else setOutside(true);
      return;
    }
    if (field === 'from') setFrom(p);
    else setTo(p);
    addRecent(p);
    // Wracamy od razu do planera (z pominięciem ekranu wyszukiwania).
    router.dismissTo('/trasa');
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title={field === 'lodging' ? t('lodgingMapTitle') : t('planPickOnMap')} />
      {outside ? (
        <View style={s.note}>
          <Icon name="pin" size={24} color={C.orange} />
          <Txt w="bold" size={15} color={C.text2} style={{ flex: 1, lineHeight: 21 }}>
            {t('lodgingOutside')}
          </Txt>
        </View>
      ) : null}
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
            field={field === 'from' ? 'from' : 'to'}
            label={field === 'lodging' ? t('lodgingSetHere') : undefined}
            onPick={(p) => {
              onPick(p).catch(() => {});
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
