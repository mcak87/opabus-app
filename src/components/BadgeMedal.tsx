// Medalion odznaki, maskotka Pina i promienie okna „Nowa odznaka” – kształty i kolory z makiety programu nagród
// (Cowork, „Poziomy i odznaki”, 08.10.2026). Ikony liniowe 24×24 powiększone ×2 w medalionie 96×96.
import { Circle, G, Path, Rect, Svg } from 'react-native-svg';

import { BADGES, type BadgeCategory, type BadgeId } from '@/data/badgeRules';
import { t, type Key } from '@/i18n';

/** Obwódka stopnia I / II / III. */
export const TIER_RING = ['#B9C6D3', '#7F93A8', '#F2B705'];
export const ROMAN = ['I', 'II', 'III'];

const CAT: Record<BadgeCategory, { fill: string; icon: string; dash: string; dashOpacity: number }> = {
  schedule: { fill: '#0D5EAF', icon: '#FFFFFF', dash: '#FFFFFF', dashOpacity: 0.45 },
  photo: { fill: '#CFE6F7', icon: '#0D5EAF', dash: '#0D5EAF', dashOpacity: 0.35 },
  map: { fill: '#0B2545', icon: '#FFFFFF', dash: '#FFFFFF', dashOpacity: 0.4 },
  community: { fill: '#FFC93C', icon: '#0B2545', dash: '#0B2545', dashOpacity: 0.3 },
  special: { fill: '#0B2545', icon: '#FFC93C', dash: '#FFC93C', dashOpacity: 0.4 },
};
const LOCKED = { fill: '#E9EEF6', icon: '#9AA5BC', dash: '#B9C6D3', dashOpacity: 0.9 };

const PIN = 'M12 21s-7-6.5-7-11.5a7 7 0 0114 0C19 14.5 12 21 12 21z';

function Glyph({ id }: { id: BadgeId }) {
  switch (id) {
    case 'first_report':
      return (
        <>
          <Path d="M4 5h16v11H9l-5 4z" />
          <Path d="M9 10.5l2 2 4-4" />
        </>
      );
    case 'punctual':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7v5l3 2" />
        </>
      );
    case 'first_photo':
      return (
        <>
          <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <Circle cx="12" cy="13" r="3.5" />
        </>
      );
    case 'photographer':
      return (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="2" />
          <Path d="M3 16l5-5 4 4 3-3 6 6" />
          <Circle cx="16" cy="9" r="1.5" />
        </>
      );
    case 'explorer':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </>
      );
    case 'cartographer':
      return (
        <>
          <Path d={PIN} />
          <Circle cx="12" cy="9.5" r="2.5" />
        </>
      );
    case 'streak':
      return <Path d="M12 21c-4 0-6.5-2.8-6.5-6.2 0-3.6 3-5.6 3.8-9.3 2.3 1.5 3.4 3.4 3.4 5.4 1-.8 1.6-1.9 1.8-3.1 2.2 1.8 4 4.4 4 7.1C18.5 18.2 16 21 12 21z" />;
    case 'islander':
      return (
        <>
          <Path d="M3 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5" />
          <Circle cx="12" cy="10" r="3.5" />
          <Path d="M12 3v1.5M5.5 5.5l1 1M18.5 5.5l-1 1M3.5 11H5M19 11h1.5" />
        </>
      );
    case 'off_season':
      return (
        <>
          <Path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" />
          <Path d="M5 19l8-8" />
        </>
      );
  }
}

export const badgeName = (id: BadgeId) => t(`badge_${id}` as Key);
export const badgeDesc = (id: BadgeId) => t(`badge_${id}_desc` as Key);

/** Medalion: kolor kategorii, obwódka zdobytego stopnia; `tier` 0 = jeszcze nie zdobyta (szary). */
export function BadgeMedal({ id, tier, size = 64 }: { id: BadgeId; tier: number; size?: number }) {
  const def = BADGES.find((b) => b.id === id)!;
  const c = tier > 0 ? CAT[def.category] : LOCKED;
  const label = tier > 0 ? `${badgeName(id)} ${def.tiers.length > 1 ? ROMAN[tier - 1] : ''}`.trim() : `${badgeName(id)} – ${t('badgeLocked')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityRole="image" accessibilityLabel={label}>
      <Circle cx="48" cy="48" r="45" fill={c.fill} stroke={tier > 0 ? TIER_RING[tier - 1] : '#D5DDEA'} strokeWidth={tier > 0 ? 5 : 2} />
      <Circle cx="48" cy="48" r="38" fill="none" stroke={c.dash} strokeOpacity={c.dashOpacity} strokeWidth={2} strokeDasharray="3 4" />
      <G transform="translate(24 24) scale(2)" fill="none" stroke={c.icon} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <Glyph id={id} />
      </G>
    </Svg>
  );
}

/** Pina – maskotka OpaBus (pinezka z oczami i niebieskim paskiem). */
export function Pina({ width = 74 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 92) / 74} viewBox="0 0 74 92" accessibilityRole="image" accessibilityLabel="Pina">
      <Path d="M37 90S6 58 6 34a31 31 0 0162 0c0 24-31 56-31 56z" fill="#FFC93C" stroke="#0B2545" strokeWidth={3} />
      <Rect x="8" y="40" width="58" height="9" fill="#0D5EAF" />
      <Circle cx="26" cy="27" r="8" fill="#FFFFFF" stroke="#0B2545" strokeWidth={2.5} />
      <Circle cx="48" cy="27" r="8" fill="#FFFFFF" stroke="#0B2545" strokeWidth={2.5} />
      <Circle cx="28" cy="28" r="3.5" fill="#0B2545" />
      <Circle cx="50" cy="28" r="3.5" fill="#0B2545" />
      <Path d="M30 58q7 6 14 0" fill="none" stroke="#0B2545" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Promienie i iskry za medalionem (390×460, środek w 195,250). */
export function Rays({ width }: { width: number }) {
  return (
    <Svg width={width} height={(width * 460) / 390} viewBox="0 0 390 460" pointerEvents="none">
      <G fill="#0D5EAF" opacity={0.55}>
        <Path d="M195 250L150 0h90z" />
        <Path d="M195 250L390 60v90z" />
        <Path d="M195 250L390 330v90z" />
        <Path d="M195 250L0 60v90z" />
        <Path d="M195 250L0 330v90z" />
      </G>
      <G fill="#FFC93C">
        <Circle cx="70" cy="120" r="4" />
        <Circle cx="330" cy="100" r="5" />
        <Circle cx="310" cy="300" r="3" />
        <Circle cx="60" cy="330" r="5" />
        <Path d="M110 70l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
        <Path d="M290 200l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" />
      </G>
    </Svg>
  );
}
