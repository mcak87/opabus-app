// Wiersz miejsca z OpenStreetMap w wyszukiwarce (hotel, plaża, zabytek, ulica…): ikona rodzaju, nazwa, rodzaj · region · odległość.
import { Pressable, StyleSheet, View } from 'react-native';

import { C } from '@/constants/theme';
import type { PlaceCat, PlaceHit } from '@/data/places';
import { decimal, getLang, t, type Key } from '@/i18n';

import { Icon, type IconName } from './Icon';
import { Txt } from './ui';

const ICON: Record<PlaceCat, IconName> = { h: 'bed', b: 'umbrella', s: 'flag', w: 'church', e: 'school', m: 'medical', t: 'ferry', f: 'cup', p: 'cart', v: 'pin', r: 'map', a: 'home' };

export const placeCatLabel = (cat: PlaceCat) => t(`placeCat_${cat}` as Key);

/** Nazwa do wyświetlenia: po grecku dla greckiego interfejsu, inaczej łacinką (oryginał jako podpis). */
export function placeTitle(p: Pick<PlaceHit, 'name' | 'latin'>): { main: string; sub: string | null } {
  if (getLang() === 'el' || p.latin === p.name) return { main: p.name, sub: p.latin !== p.name ? p.latin : null };
  return { main: p.latin, sub: p.name };
}

const distText = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${decimal((m / 1000).toFixed(m < 10_000 ? 1 : 0))} km`);

export function PlaceRow({ place, region, first, onPress }: { place: PlaceHit; region: string; first?: boolean; onPress: () => void }) {
  const title = placeTitle(place);
  const meta = [placeCatLabel(place.cat), title.sub, region, place.dist !== null ? distText(place.dist) : null].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.row, !first && s.line]}>
      <View style={s.icon}>
        <Icon name={ICON[place.cat]} size={18} color={C.orangeText} stroke={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt w="extrabold" size={16} color={C.ink} numberOfLines={1}>
          {title.main}
        </Txt>
        <Txt w="bold" size={13} color={C.muted} numberOfLines={1}>
          {meta}
        </Txt>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14 },
  line: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  icon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.orangeBg, alignItems: 'center', justifyContent: 'center' },
});
