// Planer – wybór miejsca „Skąd” / „Dokąd” (projekt: canvas „Szukaj”): moja lokalizacja, wskazanie na mapie, przystanki.
// field=lodging – ten sam ekran ustawia „Mój nocleg” (przystanek, punkt na mapie albo GPS „Jestem w noclegu”).
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { Txt } from '@/components/ui';
import { C, F, shadow } from '@/constants/theme';
import { OVERLAY_REGIONS, useData } from '@/data/DataContext';
import { lodgingPlace, setLodgingAt, setLodgingFromPlace } from '@/data/lodging';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { searchStations, type Station } from '@/data/queries';
import { t, useLang, type Key } from '@/i18n';
import { currentPosition } from '@/lib/position';
import { useSettings } from '@/lib/settings';
import { placeName } from '@/planner/format';
import { addRecent, setFrom, setTo, usePlanner, type Place } from '@/planner/store';

type Hit = Station & { region: string };

export default function PlaceSearch() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const { field } = useLocalSearchParams<{ field: 'from' | 'to' | 'lodging' }>();
  const forLodging = field === 'lodging';
  const { recent } = usePlanner();
  const { lodging } = useSettings();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Key | null>(null);
  const regions = Object.keys(data.installed).filter((r) => !OVERLAY_REGIONS.has(r));

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
        out.push(...(await searchStations(db, q, 25)).map((s) => ({ ...s, region })));
      }
      if (alive) setHits(out.slice(0, 40));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, regions.join(',')]);

  const packages = data.manifest?.packages ?? [];

  const chooseLodging = async (p: Place) => {
    setBusy(true);
    setMsg(null);
    try {
      if (await setLodgingFromPlace(p, packages)) router.back();
      else setMsg('lodgingOutside');
    } catch {
      setMsg('errorGeneric');
    } finally {
      setBusy(false);
    }
  };

  /** „Jestem w noclegu”: obecne położenie z GPS. */
  const lodgingHere = async () => {
    setBusy(true);
    setMsg(null);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      const pos = perm.granted ? await currentPosition(12_000) : null;
      if (!pos) setMsg('lodgingNoGps');
      else if (await setLodgingAt({ lat: pos.coords.latitude, lon: pos.coords.longitude }, packages)) router.back();
      else setMsg('lodgingOutside');
    } catch {
      setMsg('errorGeneric');
    } finally {
      setBusy(false);
    }
  };

  const choose = (p: Place) => {
    if (forLodging) {
      chooseLodging(p);
      return;
    }
    if (field === 'from') setFrom(p);
    else setTo(p);
    addRecent(p);
    router.back();
  };

  const chip = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.chip}>
      <Icon name={icon} size={18} color={C.blue} stroke={2.2} />
      <Txt w="extrabold" size={14} color={C.ink}>
        {label}
      </Txt>
    </Pressable>
  );

  const list = hits ?? null;

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.searchRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} style={s.round}>
            <Icon name="chevronL" size={22} stroke={2.4} />
          </Pressable>
          <View style={s.input}>
            <Icon name={forLodging ? 'home' : 'pin'} size={20} color={field === 'from' ? C.blue : C.orange} />
            <TextInput
              autoFocus={!forLodging}
              value={q}
              onChangeText={setQ}
              placeholder={forLodging ? t('lodgingSearchPlaceholder') : field === 'from' ? t('planFromPlaceholder') : t('planToPlaceholder')}
              placeholderTextColor="#7A849E"
              accessibilityLabel={forLodging ? t('lodgingSearchPlaceholder') : field === 'from' ? t('planFromPlaceholder') : t('planToPlaceholder')}
              autoCorrect={false}
              style={s.text}
            />
            {q ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={() => setQ('')} style={s.clear}>
                <Icon name="x" size={16} color={C.text2} stroke={2.6} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={s.chips}>
          {forLodging ? chip('locate', t('lodgingHere'), lodgingHere) : chip('locate', t('myLocation'), () => choose({ kind: 'me' }))}
          {!forLodging && lodging ? chip('home', t('lodgingTitle'), () => choose(lodgingPlace(lodging))) : null}
          {chip('map', t('planPickOnMap'), () => router.push({ pathname: '/planer/mapa', params: { field } }))}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {forLodging ? (
          <Txt w="bold" size={14} color={C.text2} style={s.lodgingIntro}>
            {t('lodgingIntro')}
          </Txt>
        ) : null}
        {busy ? <ActivityIndicator color={C.blue} style={{ marginVertical: 8 }} /> : null}
        {msg ? (
          <Txt w="bold" size={14} color={C.orangeText} style={s.lodgingIntro}>
            {t(msg)}
          </Txt>
        ) : null}
        {list && list.length === 0 ? <Txt color={C.muted}>{t('searchNothing')}</Txt> : null}
        {list && list.length ? (
          <>
            <Txt w="black" size={12} color={C.muted} style={s.kicker}>
              {t('planStops').toUpperCase()}
            </Txt>
            <View style={s.card}>
              {list.map((h, i) => {
                const n = stationNames(h);
                return (
                  <Pressable
                    key={`${h.region}:${h.id}`}
                    accessibilityRole="button"
                    onPress={() => choose({ kind: 'station', region: h.region, id: h.id, name: h.name, name_en: h.name_en, lat: h.lat, lon: h.lon })}
                    style={[s.row, i > 0 && s.rowLine]}>
                    <View style={s.stopIcon}>
                      <Icon name="bus" size={18} color="#FFFFFF" stroke={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt w="extrabold" size={16} color={C.ink} numberOfLines={1}>
                        {n.main}
                      </Txt>
                      <Txt w="bold" size={13} color={C.muted} numberOfLines={1}>
                        {[n.sub, data.regionName(h.region)].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {!list && recent.length ? (
          <>
            <Txt w="black" size={12} color={C.muted} style={s.kicker}>
              {t('planRecent').toUpperCase()}
            </Txt>
            <View style={s.card}>
              {recent.map((p, i) => (
                <Pressable key={i} accessibilityRole="button" onPress={() => choose(p)} style={[s.row, i > 0 && s.rowLine]}>
                  <Icon name="clock" size={20} color={C.muted} />
                  <Txt w="extrabold" size={15} color={C.ink} style={{ flex: 1 }} numberOfLines={1}>
                    {placeName(p)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={s.offline}>
          <Icon name="cloudCheck" size={18} color={C.green} />
          <Txt w="bold" size={13} color={C.muted}>
            {t('planSearchOffline')}
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: 14, gap: 12, ...shadow },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 50, borderRadius: 16, borderWidth: 2, borderColor: C.blue, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6 },
  text: { flex: 1, fontFamily: F.extrabold, fontSize: 17, color: C.ink },
  clear: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.lineSoft, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#D5DDEF', backgroundColor: '#FFFFFF' },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  kicker: { marginLeft: 8, letterSpacing: 0.8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  stopIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: 8 },
  lodgingIntro: { marginHorizontal: 8, lineHeight: 20 },
});
