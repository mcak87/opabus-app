// Trasa – planer A → B (projekt: canvas „Trasa”). Skąd / Dokąd / Kiedy → wyniki w /planer/wyniki.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, PanoramaHeader, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { OVERLAY_REGIONS, useData } from '@/data/DataContext';
import { loadPopular, stationNames } from '@/data/nearby';
import type { Station } from '@/data/queries';
import { t, useLang } from '@/i18n';
import { useSettings } from '@/lib/settings';
import { hhmm } from '@/lib/time';
import { placeName } from '@/planner/format';
import { setTo, setWhen, swapPlaces, usePlanner, type Place, type When } from '@/planner/store';

const STEP = 15 * 60;

export default function RouteScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const { homeRegion } = useSettings();
  const { from, to, when, time, recent } = usePlanner();
  const region = homeRegion && data.installed[homeRegion] ? homeRegion : Object.keys(data.installed).find((r) => !OVERLAY_REGIONS.has(r));

  const [popular, setPopular] = useState<{ region: string; items: Station[] } | null>(null);
  useEffect(() => {
    if (!region) return;
    let alive = true;
    loadPopular(region)
      .then((items) => alive && setPopular({ region, items }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [region]);

  const go = () => router.push('/planer/wyniki');
  const pick = (field: 'from' | 'to') => router.push({ pathname: '/planer/szukaj', params: { field } });
  const goTo = (p: Place) => {
    setTo(p);
    go();
  };
  const choose = (w: When) => setWhen(w, w === 'tomorrow' && when !== 'tomorrow' ? 8 * 3600 : time);

  return (
    <View style={s.screen}>
      <PanoramaHeader region={region} height={64} style={{ paddingTop: insets.top + 14, paddingBottom: 30 }}>
        <Txt w="black" size={30} color={C.ink} style={{ paddingHorizontal: 24 }}>
          {t('routeTitle')}
        </Txt>
      </PanoramaHeader>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Pressable accessibilityRole="button" onPress={() => pick('from')} style={[s.field, s.fieldLine]}>
            <View style={s.dotFrom} />
            <View style={{ flex: 1 }}>
              <Txt w="extrabold" size={12} color={C.muted}>
                {t('planFrom')}
              </Txt>
              <Txt w="extrabold" size={16} color={C.ink} numberOfLines={1}>
                {placeName(from)}
              </Txt>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => pick('to')} style={s.field}>
            <Icon name="pin" size={22} color={C.orange} />
            <View style={{ flex: 1 }}>
              <Txt w="extrabold" size={12} color={C.muted}>
                {t('planTo')}
              </Txt>
              <Txt w="extrabold" size={16} color={to ? C.ink : C.faint} numberOfLines={1}>
                {to ? placeName(to) : t('planToPlaceholder')}
              </Txt>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('planSwap')} disabled={!to} onPress={swapPlaces} style={[s.swap, !to && { opacity: 0.4 }]}>
            <Icon name="swap" size={22} color="#FFFFFF" stroke={2.2} />
          </Pressable>
        </View>

        <View style={s.whenRow} accessibilityRole="radiogroup">
          {(['now', 'later', 'tomorrow'] as const).map((w) => (
            <Pressable
              key={w}
              accessibilityRole="radio"
              accessibilityState={{ selected: when === w }}
              onPress={() => choose(w)}
              style={[s.whenBtn, when === w && s.whenOn]}>
              <Txt w="extrabold" size={15} color={when === w ? C.blue : C.ink}>
                {w === 'now' ? t('whenNow') : w === 'later' ? t('whenLater') : t('whenTomorrow')}
              </Txt>
            </Pressable>
          ))}
        </View>

        {when !== 'now' ? (
          <View style={s.timeRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('timeEarlier')} onPress={() => setWhen(when, (time - STEP + 86400) % 86400)} style={s.timeBtn}>
              <Icon name="minus" size={22} color={C.blue} stroke={2.4} />
            </Pressable>
            <Txt w="black" size={28} color={C.ink} style={{ minWidth: 100, textAlign: 'center' }}>
              {hhmm(time)}
            </Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={t('timeLater')} onPress={() => setWhen(when, (time + STEP) % 86400)} style={s.timeBtn}>
              <Icon name="plus" size={22} color={C.blue} stroke={2.4} />
            </Pressable>
          </View>
        ) : null}

        <Button title={t('planSearch')} icon="search" disabled={!to} onPress={go} />

        {recent.length ? (
          <>
            <Txt w="black" size={16} color={C.ink} style={s.section}>
              {t('planRecent')}
            </Txt>
            <View style={s.list}>
              {recent.map((p, i) => (
                <Pressable key={i} accessibilityRole="button" onPress={() => goTo(p)} style={[s.row, i > 0 && s.rowLine]}>
                  <Icon name="clock" size={20} color={C.muted} />
                  <Txt w="extrabold" size={15} color={C.ink} style={{ flex: 1 }} numberOfLines={1}>
                    {placeName(p)}
                  </Txt>
                  <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {region && popular?.region === region && popular.items.length ? (
          <>
            <Txt w="black" size={16} color={C.ink} style={s.section}>
              {t('popularIn', { name: data.regionName(region) })}
            </Txt>
            <View style={s.grid}>
              {popular.items.map((st) => (
                <Pressable
                  key={st.id}
                  accessibilityRole="button"
                  onPress={() => goTo({ kind: 'station', region, id: st.id, name: st.name, name_en: st.name_en, lat: st.lat, lon: st.lon })}
                  style={s.tile}>
                  <View style={s.tileIcon}>
                    <Icon name="pin" size={20} color={C.blue} />
                  </View>
                  <Txt w="extrabold" size={14} color={C.ink} numberOfLines={2} style={{ flex: 1 }}>
                    {stationNames(st).main}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingLeft: 16, paddingRight: 68, ...shadow },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62 },
  fieldLine: { borderBottomWidth: 1, borderBottomColor: C.line },
  dotFrom: { width: 16, height: 16, borderRadius: 8, borderWidth: 4, borderColor: C.blue, backgroundColor: '#FFFFFF', marginHorizontal: 3 },
  swap: { position: 'absolute', right: 12, top: 40, width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  whenRow: { flexDirection: 'row', gap: 8 },
  whenBtn: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: '#D5DDEF', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  whenOn: { borderColor: C.blue, backgroundColor: C.sky },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 8 },
  timeBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  section: { marginLeft: 8, marginTop: 6 },
  list: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%', flexGrow: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 12, ...shadow },
  tileIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
});
