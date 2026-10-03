// Zgłoszenie poprawki położenia przystanku: link z Google Maps, GPS przy przystanku albo wskazanie na mapie.
// Zgłoszenie trafia do panelu opabus.com/admin/przystanki – po zatwierdzeniu poprawiamy przystanek w paczce.
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Txt } from '@/components/ui';
import { C, F, shadow } from '@/constants/theme';
import { stationNames } from '@/data/nearby';
import { DATA_URL, openRegion } from '@/data/packages';
import { stationById, stationStops, type Station, type StationStop } from '@/data/queries';
import { arrow, getLang, t, useLang, type Key } from '@/i18n';
import { distanceM } from '@/lib/geo';
import { isShortMapsLink, parseCoords, resolveMapsLink } from '@/lib/mapsLink';
import { takePickedPoint } from '@/lib/pickedPoint';
import { currentPosition } from '@/lib/position';
import { IS_EXPO_GO } from '@/lib/runtime';

type Proposal = { lat: number; lon: number; source: 'link' | 'gps' | 'map'; accuracy?: number; link?: string };

const MAX_MOVE_M = 5000;
const sentKey = (region: string, station: string) => `stopfix.sent.v1.${region}:${station}`;

export default function FixStopScreen() {
  useLang();
  const { region, station } = useLocalSearchParams<{ region: string; station: string }>();
  const [st, setSt] = useState<Station | null>(null);
  const [stops, setStops] = useState<StationStop[]>([]);
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<'link' | 'gps' | 'send' | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [gpsWeak, setGpsWeak] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [already] = useState(() => !!Storage.getItemSync(sentKey(region, station)));

  useEffect(() => {
    let alive = true;
    openRegion(region)
      .then(async ({ db }) => {
        const [s, list] = await Promise.all([stationById(db, Number(station)), stationStops(db, Number(station))]);
        if (!alive) return;
        setSt(s);
        setStops(list);
      })
      .catch(() => alive && setError('errorGeneric'));
    return () => {
      alive = false;
    };
  }, [region, station]);

  // Powrót z mapy: punkt wskazany na ekranie /popraw/mapa.
  useFocusEffect(
    useCallback(() => {
      const p = takePickedPoint();
      if (p) {
        setProposal({ ...p, source: 'map' });
        setError(null);
      }
    }, []),
  );

  // Punkt odniesienia: wybrany słupek albo środek stacji.
  const selected = stops.find((s) => s.code === code);
  const ref = selected ?? st;
  const moved = proposal && ref ? Math.round(distanceM(ref.lat, ref.lon, proposal.lat, proposal.lon)) : null;
  const tooFar = moved !== null && moved > MAX_MOVE_M;

  const onLink = (text: string) => {
    setLink(text);
    setError(null);
    const c = parseCoords(text);
    if (c) setProposal({ ...c, source: 'link', link: text.trim() });
  };

  const checkLink = async () => {
    setBusy('link');
    setError(null);
    try {
      const c = await resolveMapsLink(link);
      if (c) setProposal({ ...c, source: 'link', link: link.trim() });
      else setError('fixLinkBad');
    } catch {
      setError('fixLinkBad');
    } finally {
      setBusy(null);
    }
  };

  const useGps = async () => {
    setBusy('gps');
    setError(null);
    setGpsWeak(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      const pos = perm.granted ? await currentPosition(15_000) : null;
      if (!pos) {
        setError('locDenied');
        return;
      }
      const acc = Math.round(pos.coords.accuracy ?? 999);
      if (acc > 50) setGpsWeak(acc);
      setProposal({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'gps', accuracy: acc });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!proposal || !st) return;
    setBusy('send');
    setError(null);
    try {
      const res = await fetch(`${DATA_URL}/api/stop-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region,
          station: Number(station),
          stationName: stationNames(st).main,
          stops: stops.map((s) => ({ code: s.code, lat: s.lat, lon: s.lon })),
          code,
          old: { lat: ref!.lat, lon: ref!.lon },
          new: { lat: proposal.lat, lon: proposal.lon },
          source: proposal.source,
          accuracy: proposal.accuracy ?? null,
          link: proposal.link ?? '',
          comment: comment.trim(),
          app: Constants.expoConfig?.version ?? '',
          lang: getLang(),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      Storage.setItemSync(sentKey(region, station), new Date().toISOString());
      setSent(true);
    } catch {
      setError('fixSendError');
    } finally {
      setBusy(null);
    }
  };

  const names = st ? stationNames(st) : null;

  if (sent) {
    return (
      <View style={s.screen}>
        <ScreenHeader region={region} kicker={t('fixTitle')} title={names?.main ?? '…'} />
        <View style={s.body}>
          <View style={[s.card, { alignItems: 'center', gap: 10, paddingVertical: 28 }]}>
            <View style={s.thanksIcon}>
              <Icon name="check" size={34} color="#FFFFFF" stroke={3} />
            </View>
            <Txt w="black" size={24} color={C.ink}>
              {t('fixThanks')}
            </Txt>
            <Txt w="semibold" size={15} color={C.text2} style={{ textAlign: 'center', lineHeight: 21 }}>
              {t('fixThanksBody')}
            </Txt>
            <Button title={t('back')} kind="outline" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader region={region} kicker={t('fixTitle')} title={names?.main ?? '…'} sub={names?.sub} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Txt w="semibold" size={15} color={C.text2} style={{ lineHeight: 21, paddingHorizontal: 4 }}>
          {t('fixIntro')}
        </Txt>
        {already ? (
          <Txt w="bold" size={13} color={C.muted} style={{ paddingHorizontal: 4 }}>
            {t('fixAlready')}
          </Txt>
        ) : null}

        {stops.length > 1 ? (
          <View style={s.card}>
            <Txt w="black" size={15} color={C.ink}>
              {t('fixWhich')}
            </Txt>
            {[{ code: '', label: t('fixWhole') }, ...stops.map((x) => ({ code: x.code, label: x.headsigns.length ? `${arrow()} ${x.headsigns.slice(0, 2).join(', ')}` : x.code }))].map((o) => (
              <Pressable key={o.code || '_'} accessibilityRole="radio" accessibilityState={{ selected: code === o.code }} onPress={() => setCode(o.code)} style={s.option}>
                <View style={[s.radio, code === o.code && s.radioOn]} />
                <Txt w="bold" size={15} color={C.ink} style={{ flex: 1 }} numberOfLines={2}>
                  {o.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={s.card}>
          <View style={s.cardHead}>
            <Icon name="map" size={20} color={C.blue} />
            <Txt w="black" size={15} color={C.ink}>
              {t('fixLinkTitle')}
            </Txt>
          </View>
          <Txt w="semibold" size={13} color={C.muted} style={{ lineHeight: 18 }}>
            {t('fixLinkHint')}
          </Txt>
          <TextInput
            value={link}
            onChangeText={onLink}
            placeholder={t('fixLinkPlaceholder')}
            placeholderTextColor="#7A849E"
            accessibilityLabel={t('fixLinkTitle')}
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          {isShortMapsLink(link) && !(proposal?.source === 'link' && proposal.link === link.trim()) ? (
            <Button title={t('fixLinkCheck')} kind="outline" icon="search" loading={busy === 'link'} onPress={checkLink} />
          ) : null}
        </View>

        <View style={s.card}>
          <View style={s.cardHead}>
            <Icon name="locate" size={20} color={C.blue} />
            <Txt w="black" size={15} color={C.ink}>
              {t('fixGpsTitle')}
            </Txt>
          </View>
          <Button title={t('fixGpsButton')} kind="outline" icon="locate" loading={busy === 'gps'} onPress={useGps} />
          {gpsWeak ? (
            <Txt w="bold" size={13} color={C.orangeText}>
              {t('fixGpsWeak', { m: gpsWeak })}
            </Txt>
          ) : null}
        </View>

        {!IS_EXPO_GO && ref ? (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Icon name="pin" size={20} color={C.blue} />
              <Txt w="black" size={15} color={C.ink}>
                {t('fixMapTitle')}
              </Txt>
            </View>
            <Button
              title={t('fixMapButton')}
              kind="outline"
              icon="map"
              onPress={() => router.push({ pathname: '/popraw/mapa', params: { lat: String(ref.lat), lon: String(ref.lon) } })}
            />
          </View>
        ) : null}

        {proposal ? (
          <View style={[s.card, s.preview, tooFar && { borderColor: C.orangeLine, backgroundColor: C.orangeBg }]}>
            <Txt w="black" size={15} color={C.ink}>
              {t('fixNew')}
            </Txt>
            <Txt w="bold" size={15} color={C.text2}>
              {proposal.lat.toFixed(6)}, {proposal.lon.toFixed(6)}
            </Txt>
            <Txt w="bold" size={13} color={tooFar ? C.orangeText : C.muted}>
              {[moved !== null ? t('fixMoved', { m: moved }) : null, proposal.accuracy ? t('fixAccuracy', { m: proposal.accuracy }) : null].filter(Boolean).join(' · ')}
            </Txt>
            {tooFar ? (
              <Txt w="bold" size={13} color={C.orangeText}>
                {t('fixTooFar')}
              </Txt>
            ) : null}
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${proposal.lat},${proposal.lon}`)} hitSlop={6}>
              <Txt w="extrabold" size={14} color={C.blue}>
                {t('fixCheckGoogle')}
              </Txt>
            </Pressable>
          </View>
        ) : null}

        <View style={s.card}>
          <Txt w="black" size={15} color={C.ink}>
            {t('fixComment')}
          </Txt>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={t('fixCommentPlaceholder')}
            placeholderTextColor="#7A849E"
            accessibilityLabel={t('fixComment')}
            maxLength={300}
            multiline
            style={[s.input, { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }]}
          />
        </View>

        {error ? (
          <Txt w="bold" size={14} color={C.orangeText} style={{ paddingHorizontal: 4 }}>
            {t(error)}
          </Txt>
        ) : null}
        <Txt w="semibold" size={12} color={C.muted} style={{ paddingHorizontal: 4 }}>
          {t('fixPrivacy')}
        </Txt>
        {busy === 'send' ? <ActivityIndicator color={C.blue} /> : null}
        <Button title={t('fixSend')} icon="check" disabled={!proposal || tooFar || !ref || busy !== null} onPress={send} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, gap: 10, ...shadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: '#D5DDEF', paddingHorizontal: 12, fontFamily: F.bold, fontSize: 15, color: C.text },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.faint },
  radioOn: { borderColor: C.blue, borderWidth: 7 },
  preview: { borderWidth: 1.5, borderColor: C.blue },
  thanksIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});
