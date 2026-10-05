// Karta przystanku na ekranie Start (najbliższe i ulubione): ikona, nazwa, dopisek po prawej, najbliższe odjazdy.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { C } from '@/constants/theme';
import { photoUrl, useStationPhotos } from '@/data/photos';
import type { Departure } from '@/data/queries';
import { t } from '@/i18n';

import { DepartureRow } from './DepartureRow';
import { Icon, type IconName } from './Icon';
import { Txt } from './ui';

export function StationCard({
  region,
  station,
  title,
  sub,
  icon = 'bus',
  iconBg = C.blue,
  right,
  departures,
  nowSec,
  emptyText,
}: {
  region: string;
  station: number;
  title: string;
  sub?: string | null;
  icon?: IconName;
  iconBg?: string;
  right?: ReactNode;
  departures: Departure[] | null;
  nowSec: number;
  emptyText: string;
}) {
  const photo = useStationPhotos(region, station)[0];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/stop/[region]/[station]', params: { region, station: String(station) } })}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
      <View style={s.row}>
        {/* Zdjęcie przystanku (od użytkowników) zamiast ikony – łatwiej go znaleźć na miejscu. */}
        {photo ? (
          <Image source={{ uri: photoUrl(photo.id) }} style={s.photo} contentFit="cover" cachePolicy="disk" accessibilityLabel={t('photoOpen')} />
        ) : (
          <View style={[s.icon, { backgroundColor: iconBg }]}>
            <Icon name={icon} size={20} color="#FFFFFF" stroke={2.2} fill={icon === 'star' ? '#FFFFFF' : 'none'} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Txt w="extrabold" size={17} color={C.ink} numberOfLines={1}>
            {title}
          </Txt>
          {sub ? (
            <Txt w="semibold" size={13} color={C.muted} numberOfLines={1}>
              {sub}
            </Txt>
          ) : null}
        </View>
        {right}
      </View>
      {departures === null ? null : departures.length === 0 ? (
        <Txt w="semibold" size={14} color={C.muted}>
          {emptyText}
        </Txt>
      ) : (
        departures.map((d) => <DepartureRow key={`${d.dayOffset}:${d.tripId}`} d={d} nowSec={nowSec} />)
      )}
    </Pressable>
  );
}

/** Nagłówek sekcji listy (np. „Ulubione”). */
export function SectionTitle({ text, right }: { text: string; right?: string }) {
  return (
    <View style={s.head}>
      <Txt w="black" size={19} color={C.ink} style={{ flex: 1 }}>
        {text}
      </Txt>
      {right ? (
        <Txt w="bold" size={13} color={C.muted}>
          {right}
        </Txt>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, gap: 6, borderWidth: 1, borderColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 52, height: 52, borderRadius: 12, backgroundColor: C.sky },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4, marginTop: 4 },
});
