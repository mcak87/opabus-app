// Przystanki – wyszukiwarka po nazwie (grecka i łacińska, bez akcentów) we wszystkich pobranych regionach.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { PanoramaHeader, Txt } from '@/components/ui';
import { C, F, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { searchStations, type Station } from '@/data/queries';
import { t, useLang } from '@/i18n';

type Hit = Station & { region: string };

export default function StopsScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const regions = Object.keys(data.installed);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      if (q.trim().length < 2) {
        setHits(null);
        return;
      }
      const out: Hit[] = [];
      for (const region of regions) {
        const { db } = await openRegion(region);
        out.push(...(await searchStations(db, q, 20)).map((s) => ({ ...s, region })));
      }
      if (alive) setHits(out.slice(0, 50));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, regions.join(',')]);

  return (
    <View style={s.screen}>
      <PanoramaHeader height={64} style={{ paddingTop: insets.top + 14, paddingBottom: 20 }}>
        <Txt w="black" size={30} color={C.ink} style={{ paddingHorizontal: 24 }}>
          {t('tabStops')}
        </Txt>
        <View style={s.search}>
          <Icon name="search" size={22} color={C.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor="#7A849E"
            accessibilityLabel={t('searchPlaceholder')}
            autoCorrect={false}
            style={s.input}
          />
        </View>
      </PanoramaHeader>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {regions.length === 0 ? <Txt color={C.muted}>{t('searchNoRegions')}</Txt> : null}
        {regions.length > 0 && !hits ? <Txt color={C.muted}>{t('searchHint')}</Txt> : null}
        {hits && hits.length === 0 ? <Txt color={C.muted}>{t('searchNothing')}</Txt> : null}
        {hits?.map((h) => {
          const n = stationNames(h);
          return (
            <Pressable
              key={`${h.region}:${h.id}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/stop/[region]/[station]', params: { region: h.region, station: String(h.id) } })}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
              <View style={s.icon}>
                <Icon name="bus" size={20} color={C.blue} stroke={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt w="extrabold" size={16} color={C.ink} numberOfLines={1}>
                  {n.main}
                </Txt>
                <Txt w="bold" size={13} color={C.muted} numberOfLines={1}>
                  {[n.sub, data.regionName(h.region)].filter(Boolean).join(' · ')}
                </Txt>
              </View>
              <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  search: {
    marginHorizontal: 16,
    marginTop: 14,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    ...shadow,
  },
  input: { flex: 1, fontFamily: F.bold, fontSize: 16, color: C.text },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
});
