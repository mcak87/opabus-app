// Przystanki – wyszukiwarka po nazwie (grecka i łacińska, bez akcentów) we wszystkich pobranych regionach
// albo mapa przystanków (tylko w wersji testowej OpaBus – Expo Go nie ma modułu map).
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { PanoramaHeader, Txt } from '@/components/ui';
import { C, F, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { searchStations, type Station } from '@/data/queries';
import { t, useLang } from '@/i18n';
import { IS_EXPO_GO } from '@/lib/runtime';
import { useSettings } from '@/lib/settings';

// Mapa ładowana dopiero przy otwarciu – w Expo Go moduł MapLibre w ogóle nie jest wczytywany.
const StopsMap = lazy(() => import('@/components/StopsMap'));

type Hit = Station & { region: string };

export default function StopsScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
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
      setView('list');
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
      <PanoramaHeader height={64} style={{ paddingTop: insets.top + 14, paddingBottom: view === 'map' ? 14 : 20 }}>
        <View style={s.titleRow}>
          <Txt w="black" size={30} color={C.ink} style={{ flex: 1 }}>
            {t('tabStops')}
          </Txt>
          <View style={s.toggle} accessibilityRole="tablist">
            {(['list', 'map'] as const).map((v) => (
              <Pressable
                key={v}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === v }}
                onPress={() => setView(v)}
                style={[s.toggleBtn, view === v && s.toggleOn]}>
                <Icon name={v === 'list' ? 'search' : 'pin'} size={16} color={view === v ? '#FFFFFF' : C.blue} stroke={2.4} />
                <Txt w="extrabold" size={13} color={view === v ? '#FFFFFF' : C.blue}>
                  {v === 'list' ? t('viewList') : t('viewMap')}
                </Txt>
              </Pressable>
            ))}
          </View>
        </View>
        {view === 'list' ? (
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
        ) : null}
      </PanoramaHeader>
      {view === 'map' ? (
        IS_EXPO_GO ? (
          <View style={s.body}>
            <View style={s.note}>
              <Icon name="pin" size={24} color={C.blue} />
              <Txt w="bold" size={15} color={C.text2} style={{ flex: 1, lineHeight: 21 }}>
                {t('mapNeedsBuild')}
              </Txt>
            </View>
          </View>
        ) : (
          <Suspense fallback={<ActivityIndicator color={C.blue} style={{ marginTop: 40 }} />}>
            <StopsMap />
          </Suspense>
        )
      ) : (
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
      )}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 24, paddingRight: 16 },
  toggle: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 3, ...shadow },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 11, borderRadius: 15 },
  toggleOn: { backgroundColor: C.blue },
  note: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sky, borderRadius: 18, padding: 16 },
});
