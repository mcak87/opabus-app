// Zdjęcia przystanku (od użytkowników, zatwierdzone przez Michała): galeria na ekranie przystanku z podglądem na cały
// ekran, kafelek „Dodaj zdjęcie” i miniatura do kart przystanków. Logika: data/photos.ts.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, shadow } from '@/constants/theme';
import { photoUrl, usePendingMine, useStationPhotos, type StopPhoto } from '@/data/photos';
import { t, useLang } from '@/i18n';

import { Icon } from './Icon';
import { Txt } from './ui';

const openAdd = (region: string, station: number) => router.push({ pathname: '/zdjecie/[region]/[station]', params: { region, station: String(station) } });

/** Galeria na górze ekranu przystanku (tylko gdy są zdjęcia albo czeka moje). */
export function StopPhotos({ region, station, stopCodes }: { region: string; station: number; stopCodes: string[] }) {
  useLang();
  const photos = useStationPhotos(region, station, stopCodes);
  const pending = usePendingMine(region, station);
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length && !pending) return null;
  return (
    <View style={{ gap: 6 }}>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          {photos.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel={p.caption || t('photoOpen')} onPress={() => setOpen(i)} style={s.thumbWrap}>
              <Image source={{ uri: photoUrl(p.id) }} style={[s.thumb, { aspectRatio: Math.min(1.6, Math.max(0.7, p.w / p.h)) }]} contentFit="cover" cachePolicy="disk" transition={150} />
              {p.caption ? (
                <Txt w="bold" size={12} color={C.text2} numberOfLines={2} style={s.thumbCaption}>
                  {p.caption}
                </Txt>
              ) : null}
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => openAdd(region, station)} style={s.addTile}>
            <Icon name="camera" size={26} color={C.blue} />
            <Txt w="extrabold" size={13} color={C.blue} style={{ textAlign: 'center' }}>
              {t('photoAdd')}
            </Txt>
          </Pressable>
        </ScrollView>
      ) : null}
      {pending ? (
        <View style={s.pending}>
          <Icon name="clock" size={18} color={C.blue} />
          <Txt w="bold" size={13} color={C.text2} style={{ flex: 1 }}>
            {t('photoPending')}
          </Txt>
        </View>
      ) : null}
      <PhotoViewer photos={photos} index={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/** Zachęta na dole ekranu przystanku, gdy nie ma jeszcze zdjęć. */
export function AddPhotoLink({ region, station, stopCodes }: { region: string; station: number; stopCodes: string[] }) {
  useLang();
  const photos = useStationPhotos(region, station, stopCodes);
  const pending = usePendingMine(region, station);
  if (photos.length || pending) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => openAdd(region, station)} style={s.addCard}>
      <View style={s.addIcon}>
        <Icon name="camera" size={22} color="#FFFFFF" stroke={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt w="extrabold" size={15} color={C.ink}>
          {t('photoAddTitle')}
        </Txt>
        <Txt w="semibold" size={13} color={C.text2} style={{ lineHeight: 18 }}>
          {t('photoAddBody')}
        </Txt>
      </View>
      <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
    </Pressable>
  );
}

/** Miniatura zdjęcia przystanku (karty na Start i na mapie) – null, gdy przystanek nie ma zdjęcia. */
export function StopPhotoThumb({ region, station, size = 44 }: { region: string; station: number; size?: number }) {
  const photos = useStationPhotos(region, station);
  if (!photos.length) return null;
  return <Image source={{ uri: photoUrl(photos[0].id) }} style={{ width: size, height: size, borderRadius: 14 }} contentFit="cover" cachePolicy="disk" accessibilityLabel={t('photoOpen')} />;
}

function PhotoViewer({ photos, index, onClose }: { photos: StopPhoto[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (index === null) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.viewer}>
        <ScrollView horizontal pagingEnabled contentOffset={{ x: index * width, y: 0 }} showsHorizontalScrollIndicator={false}>
          {photos.map((p) => (
            <View key={p.id} style={{ width, height, justifyContent: 'center' }}>
              <Image source={{ uri: photoUrl(p.id) }} style={{ width, height: Math.min(height * 0.75, width * (p.h / p.w)) }} contentFit="contain" cachePolicy="disk" />
              {p.caption ? (
                <Txt w="bold" size={16} color="#FFFFFF" style={s.viewerCaption}>
                  {p.caption}
                </Txt>
              ) : null}
            </View>
          ))}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={[s.close, { top: insets.top + 12 }]}>
          <Icon name="x" size={24} color="#FFFFFF" stroke={2.6} />
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  strip: { gap: 10, paddingVertical: 2, paddingHorizontal: 2 },
  thumbWrap: { width: 190, gap: 4 },
  thumb: { width: 190, borderRadius: 14, backgroundColor: C.sky },
  thumbCaption: { paddingHorizontal: 2 },
  addTile: { width: 110, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: C.blue, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, minHeight: 120 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.sky, borderRadius: 14, padding: 12 },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginTop: 4, ...shadow },
  addIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: '#0B1430' },
  viewerCaption: { textAlign: 'center', paddingHorizontal: 24, paddingTop: 16 },
  close: { position: 'absolute', right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
