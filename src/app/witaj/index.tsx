// Powitanie, krok 1: wybór języka (12 języków; bez tłumaczenia – angielski do czasu przetłumaczenia).
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Button, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { hasTranslation, LANGS, setLang, t, useLang } from '@/i18n';

export default function LanguageStep() {
  const lang = useLang();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.screen, { paddingTop: insets.top + 16 }]}>
      <View style={s.head}>
        <Logo />
        <Txt w="black" size={30} color={C.ink} style={{ marginTop: 20 }}>
          {t('langTitle')}
        </Txt>
        <Txt w="semibold" size={16} color={C.muted}>
          {t('langSub')}
        </Txt>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        <View style={s.card}>
          {LANGS.map((l, i) => {
            const selected = l.code === lang;
            return (
              <Pressable
                key={l.code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setLang(l.code)}
                style={[s.row, i > 0 && s.rowLine, selected && { backgroundColor: C.sky }]}>
                <Txt w={selected ? 'black' : 'bold'} size={17} color={selected ? C.blue : C.text} style={{ flex: 1 }}>
                  {l.name}
                </Txt>
                {!hasTranslation(l.code) ? (
                  <Txt w="semibold" size={12} color={C.muted}>
                    {t('translationSoon')}
                  </Txt>
                ) : null}
                {selected ? <Icon name="check" size={22} color={C.blue} stroke={2.6} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Button title={t('next')} icon="chevronR" onPress={() => router.push('/witaj/lokalizacja')} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.header },
  head: { paddingHorizontal: 24, gap: 4, paddingBottom: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 18 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  bottom: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: C.header },
});
