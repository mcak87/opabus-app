// Wspólne elementy interfejsu OpaBus.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { PANORAMAS } from '@/constants/panoramas';
import { C, F, lineColor, radius, shadow } from '@/constants/theme';

import { Icon, MODE_ICON, type IconName } from './Icon';

type Weight = 'semibold' | 'bold' | 'extrabold' | 'black';

export function Txt({
  w = 'bold',
  size = 15,
  color = C.text,
  style,
  ...rest
}: TextProps & { w?: Weight; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[{ fontFamily: F[w], fontSize: size, color }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'outline' | 'text';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === 'primary' ? '#FFFFFF' : C.blue;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        kind === 'primary' && { backgroundColor: C.navy },
        kind === 'outline' && { borderWidth: 2, borderColor: C.blue, backgroundColor: '#FFFFFF' },
        (pressed || disabled) && { opacity: 0.7 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} stroke={2.2} /> : null}
      <Txt w="extrabold" size={16} color={fg}>
        {title}
      </Txt>
    </Pressable>
  );
}

export function LineBadge({ label, color, agencyCode, mode, small }: { label: string; color: string | null; agencyCode: string; mode: string; small?: boolean }) {
  const bg = lineColor(color, agencyCode, mode);
  return (
    <View style={[s.badge, { backgroundColor: bg }, small && { paddingHorizontal: 6, paddingVertical: 1 }]}>
      {mode !== 'bus' && mode !== 'trolleybus' ? <Icon name={MODE_ICON[mode] ?? 'bus'} size={small ? 12 : 13} color="#FFFFFF" stroke={2.4} /> : null}
      <Txt w="extrabold" size={small ? 11 : 12} color="#FFFFFF" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Nagłówek z panoramą regionu (jasnoniebieskie sylwetki). */
export function PanoramaHeader({ region, height = 64, children, style }: { region?: string; height?: number; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const xml = PANORAMAS[panoramaFor(region)] ?? PANORAMAS.grecja;
  return (
    <View style={[s.header, style]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
        <SvgXml xml={xml} width="100%" height={height} preserveAspectRatio="xMidYMax slice" />
      </View>
      {children}
    </View>
  );
}

const PANORAMA_OF: Record<string, string> = {
  rodos: 'rodos',
  kos: 'kos',
  santorini: 'santorini',
  mykonos: 'mykonos',
  naxos: 'naxos',
  heraklion: 'heraklion',
  kreta_wschod: 'heraklion',
  chania: 'chania',
  kreta_zachod: 'chania',
  korfu: 'korfu',
  zakynthos: 'zakynthos',
  kefalonia: 'kefalonia',
  ateny: 'ateny',
  attyka: 'ateny',
  saloniki: 'saloniki',
  chalkidiki: 'chalkidiki',
  meteora: 'meteora',
  pieria: 'olimp',
  katerini: 'olimp',
  epir_parga: 'parga',
};
export const panoramaFor = (region?: string) => (region && PANORAMA_OF[region]) || 'grecja';

export function Pill({ icon, text, bg = C.greenBg, color = C.green }: { icon?: IconName; text: string; bg?: string; color?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Txt w="extrabold" size={12} color={color}>
        {text}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: radius.card, padding: 14, ...shadow },
  btn: { minHeight: 52, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 150 },
  header: { backgroundColor: C.header, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 5 },
});
