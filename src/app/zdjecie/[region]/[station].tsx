// Dodaj zdjęcie przystanku: aparat albo galeria → podgląd → podpis (opcjonalnie) → zgoda → wysłanie.
// Zdjęcie jest widoczne dla innych dopiero po zatwierdzeniu przez Michała (/admin/zdjecia). Wysyłanie: data/photos.ts.
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Txt } from '@/components/ui';
import { C, F, shadow } from '@/constants/theme';
import { stationNames } from '@/data/nearby';
import { openRegion } from '@/data/packages';
import { uploadPhoto } from '@/data/photos';
import { stationById, stationStops, type Station } from '@/data/queries';
import { t, useLang, type Key } from '@/i18n';

type Picked = { uri: string; width: number; height: number };

export default function AddStopPhoto() {
  useLang();
  const { region, station } = useLocalSearchParams<{ region: string; station: string }>();
  const [st, setSt] = useState<Station | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Key | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { db } = await openRegion(region);
      setSt(await stationById(db, Number(station)));
      setCodes((await stationStops(db, Number(station))).map((x) => x.code).filter(Boolean));
    })().catch(() => setMsg('errorGeneric'));
  }, [region, station]);

  const pick = async (from: 'camera' | 'gallery') => {
    setMsg(null);
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setMsg('photoCameraDenied');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, exif: false };
      const r = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!r.canceled && r.assets[0]) setPhoto({ uri: r.assets[0].uri, width: r.assets[0].width, height: r.assets[0].height });
    } catch {
      setMsg('errorGeneric');
    }
  };

  const send = async () => {
    if (!photo || !st || !consent) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await uploadPhoto({ region, station: st.id, stationName: st.name, stops: codes, lat: st.lat, lon: st.lon, ...photo, caption });
      if (r === 'ok') setDone(true);
      else setMsg('fixSendError');
    } catch {
      setMsg('fixSendError');
    } finally {
      setBusy(false);
    }
  };

  const names = st ? stationNames(st) : null;

  if (done) {
    return (
      <View style={s.screen}>
        <ScreenHeader region={region} kicker={t('photoTitle')} title={names?.main ?? ''} />
        <View style={s.body}>
          <View style={[s.info, { backgroundColor: C.greenBg }]}>
            <Icon name="check" size={24} color={C.green} stroke={2.6} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt w="black" size={16} color={C.green}>
                {t('photoThanks')}
              </Txt>
              <Txt w="semibold" size={14} color={C.green} style={{ lineHeight: 20 }}>
                {t('photoThanksBody')}
              </Txt>
            </View>
          </View>
          <Button title={t('close')} kind="outline" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <ScreenHeader region={region} kicker={t('photoTitle')} title={names?.main ?? '…'} sub={names?.sub} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Txt w="semibold" size={14} color={C.text2} style={{ lineHeight: 20, paddingHorizontal: 4 }}>
          {t('photoTips')}
        </Txt>

        {photo ? (
          <View style={s.card}>
            <Image source={{ uri: photo.uri }} style={[s.preview, { aspectRatio: photo.width / photo.height }]} contentFit="contain" />
            <Pressable accessibilityRole="button" onPress={() => setPhoto(null)} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Txt w="extrabold" size={14} color={C.blue}>
                {t('photoChange')}
              </Txt>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Button title={t('photoCamera')} icon="camera" onPress={() => pick('camera')} />
            <Button title={t('photoGallery')} kind="outline" icon="image" onPress={() => pick('gallery')} />
          </View>
        )}

        {photo ? (
          <View style={s.card}>
            <Txt w="extrabold" size={14} color={C.ink}>
              {t('photoCaption')}
            </Txt>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={t('photoCaptionHint')}
              placeholderTextColor={C.faint}
              maxLength={120}
              style={s.input}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consent }}
              onPress={() => setConsent((x) => !x)}
              style={s.consent}>
              <View style={[s.box, consent && s.boxOn]}>{consent ? <Icon name="check" size={16} color="#FFFFFF" stroke={3} /> : null}</View>
              <Txt w="semibold" size={13} color={C.text2} style={{ flex: 1, lineHeight: 19 }}>
                {t('photoConsent')}
              </Txt>
            </Pressable>
            <Button title={t('photoSend')} icon="check" disabled={!consent || !st} loading={busy} onPress={send} />
          </View>
        ) : null}

        {msg ? (
          <View style={s.msg}>
            <Txt w="bold" size={14} color={C.orangeText} style={{ flex: 1, lineHeight: 20 }}>
              {t(msg)}
            </Txt>
            {msg === 'photoCameraDenied' ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} hitSlop={8}>
                <Txt w="extrabold" size={14} color={C.blue}>
                  {t('openSettings')}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Txt w="semibold" size={12} color={C.muted} style={{ textAlign: 'center', marginTop: 4 }}>
          {t('photoPrivacy')}
        </Txt>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, gap: 10, ...shadow },
  preview: { width: '100%', maxHeight: 420, borderRadius: 12, backgroundColor: C.sky },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.semibold, fontSize: 15, color: C.ink },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.blue, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: C.blue },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  msg: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.orangeBg, borderRadius: 14, padding: 12 },
});
