import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, shadow } from '@/constants/theme';
import { t } from '@/i18n';

import { Icon } from './Icon';
import { PanoramaHeader, Txt } from './ui';

/** Nagłówek podstrony: przycisk wstecz, mały nadtytuł, tytuł, podtytuł, panorama regionu. */
export function ScreenHeader({ region, kicker, title, sub, right }: { region?: string; kicker?: string; title: string; sub?: string | null; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <PanoramaHeader region={region} height={56} style={{ paddingTop: insets.top + 8, paddingBottom: 44 }}>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={s.round}>
          <Icon name="chevronL" size={22} stroke={2.4} />
        </Pressable>
        {right}
      </View>
      <View style={s.texts}>
        {kicker ? (
          <Txt w="extrabold" size={13} color={C.blue} style={s.kicker}>
            {kicker}
          </Txt>
        ) : null}
        <Txt w="black" size={27} color={C.ink} numberOfLines={2}>
          {title}
        </Txt>
        {sub ? (
          <Txt w="bold" size={14} color={C.text2} numberOfLines={1}>
            {sub}
          </Txt>
        ) : null}
      </View>
    </PanoramaHeader>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...shadow },
  texts: { paddingHorizontal: 24, paddingTop: 12, gap: 2 },
  kicker: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
