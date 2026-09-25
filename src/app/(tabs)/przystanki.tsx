// Przystanki – wyszukiwarka po nazwie (grecka i łacińska, bez akcentów) we wszystkich pobranych regionach.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSettings } from '@/lib/settings';

type Hit = Station & { region: string };

export default function StopsScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const regions = Object.keys(data.installed);
  const { favorites } = useSettings();
  const favRows: Hit[] = favorites
    .filter((f) => data.installed[f.region])
    .map((f) => ({ id: f.station, name: f.name, name_en: f.name_en, lat: 0, lon: 0, region: f.region }));

  // Wejście z pola „Skąd chcesz jechać?” na Starcie – od razu klawiatura.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const input = useRef<TextInput>(null);
  useFocusEffect(
    useCallback(() => {
      if (focus !== '1') return;
      const id = setTimeout(() => input.current?.focus(), 300);
      router.setParams({ focus: '' });
      return () => clearTimeout(id);
    }, [focus]),
  );

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
            ref={input}
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
        {!hits && regions.length > 0 ? (
          <Txt w="black" size={12} color={C.muted} style={s.kicker}>
            {t('favorites').toUpperCase()}
          </Txt>
        ) : null}
        {!hits && regions.length > 0 && favRows.length === 0 ? (
          <Txt w="semibold" size={14} color={C.muted}>
            {t('favHint')}
          </Txt>
        ) : null}
        {(hits ?? favRows).map((h) => {
          const n = stationNames(h);
          const fav = !hits;
          return (
            <Pressable
              key={`${h.region}:${h.id}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/stop/[region]/[station]', params: { region: h.region, station: String(h.id) } })}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
              <View style={[s.icon, fav && { backgroundColor: C.orangeBg }]}>
                <Icon name={fav ? 'star' : 'bus'} size={20} color={fav ? C.orange : C.blue} fill={fav ? C.yellow : 'none'} stroke={2.2} />
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
  kicker: { paddingHorizontal: 4, marginTop: 8, letterSpacing: 0.8 },
});
