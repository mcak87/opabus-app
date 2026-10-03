// „Udostępnij → OpaBus” (z Google Maps, Bookingu…): szukamy położenia w udostępnionym tekście i proponujemy
// „Jedź tutaj” albo „To mój nocleg”. Bez położenia – wyszukiwarka z nazwą z udostępnienia.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { pointPlace, setLodgingAt } from '@/data/lodging';
import { t, useLang } from '@/i18n';
import type { LatLon } from '@/lib/geo';
import { firstUrl, resolveSharedText } from '@/lib/mapsLink';
import { setFrom, setTo, setWhen, type Place } from '@/planner/store';

/** Nazwa miejsca z udostępnienia: tekst przed linkiem (np. „Blue Bay Resort”), jeśli krótki. */
export function sharedTitle(text: string): string | null {
  const url = firstUrl(text);
  const head = (url ? text.slice(0, text.indexOf(url)) : text).split('\n').map((l) => l.trim()).filter(Boolean)[0];
  return head && head.length <= 80 && !/^https?:/i.test(head) ? head.replace(/[:\-–]+$/, '').trim() : null;
}

type State = { kind: 'loading' } | { kind: 'found'; point: LatLon; place: Place } | { kind: 'outside' } | { kind: 'none' };

export default function ShareScreen() {
  useLang();
  const { text = '' } = useLocalSearchParams<{ text?: string }>();
  const data = useData();
  const [st, setSt] = useState<State>({ kind: 'loading' });
  const title = sharedTitle(text);
  const packages = data.manifest?.packages;

  useEffect(() => {
    if (!packages) return; // czekamy na listę regionów
    let alive = true;
    (async () => {
      const c = await resolveSharedText(text).catch(() => null);
      if (!c) return alive && setSt({ kind: 'none' });
      const p = await pointPlace(c, packages);
      if (!alive) return;
      if (!p) setSt({ kind: 'outside' });
      else setSt({ kind: 'found', point: c, place: title && p.kind === 'point' ? { ...p, name: title, name_en: title } : p });
    })();
    return () => {
      alive = false;
    };
  }, [text, title, packages]);

  const goThere = (place: Place) => {
    setFrom({ kind: 'me' });
    setTo(place);
    setWhen('now');
    router.replace('/planer/wyniki');
  };
  const setAsLodging = async (point: LatLon) => {
    if (await setLodgingAt(point, packages ?? [], title ? { name: title, name_en: title } : undefined)) router.replace('/profil');
  };
  const search = () => router.replace({ pathname: '/planer/szukaj', params: { field: 'to', q: title ?? text } });

  return (
    <View style={s.screen}>
      <ScreenHeader kicker={t('shareKicker')} title={title ?? t('linkPoint')} />
      <View style={s.body}>
        {st.kind === 'loading' ? (
          <View style={s.center}>
            <ActivityIndicator color={C.blue} size="large" />
            <Txt w="bold" color={C.muted}>
              {t('shareLooking')}
            </Txt>
          </View>
        ) : null}

        {st.kind === 'found' ? (
          <>
            <View style={s.card}>
              <Icon name="pin" size={24} color={C.orange} />
              <Txt w="bold" size={15} color={C.text2} style={{ flex: 1, lineHeight: 21 }}>
                {t('shareFound')}
              </Txt>
            </View>
            <Button title={t('shareGo')} icon="route" onPress={() => goThere(st.place)} />
            <Button title={t('shareLodging')} kind="outline" icon="home" onPress={() => setAsLodging(st.point)} />
          </>
        ) : null}

        {st.kind === 'outside' || st.kind === 'none' ? (
          <>
            <View style={s.card}>
              <Icon name="pin" size={24} color={C.orange} />
              <Txt w="bold" size={15} color={C.text2} style={{ flex: 1, lineHeight: 21 }}>
                {st.kind === 'outside' ? t('lodgingOutside') : t('shareNone')}
              </Txt>
            </View>
            {st.kind === 'none' ? <Button title={t('shareSearch')} icon="search" onPress={search} /> : null}
            {st.kind === 'outside' ? <Button title={t('chooseRegion')} icon="download" onPress={() => router.replace('/profil')} /> : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 12 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, ...shadow },
});
