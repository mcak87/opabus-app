// Ikony liniowe (styl z projektu ekranów). Nazwa → ścieżki SVG w siatce 24×24.
import { I18nManager } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const P = (d: string) => <Path d={d} />;

const ICONS = {
  home: P('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'),
  pin: (
    <>
      {P('M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z')}
      <Circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  route: (
    <>
      <Circle cx="6" cy="19" r="2.5" />
      <Circle cx="18" cy="5" r="2.5" />
      {P('M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5')}
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8" r="4" />
      {P('M4 21a8 8 0 0 1 16 0')}
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      {P('m20 20-3.5-3.5')}
    </>
  ),
  bus: (
    <>
      <Rect x="4" y="3" width="16" height="15" rx="3" />
      {P('M4 11h16M8 18v2.5M16 18v2.5')}
    </>
  ),
  ferry: (
    <>
      {P('M3 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0')}
      {P('M5 15l1.2-5h11.6l1.2 5')}
      {P('M12 10V5M9 7h6')}
    </>
  ),
  rail: (
    <>
      <Rect x="5" y="3" width="14" height="14" rx="3" />
      {P('M5 11h14M8 21l2-4M16 21l-2-4')}
    </>
  ),
  metro: (
    <>
      <Circle cx="12" cy="12" r="9" />
      {P('M8 16V8l4 5 4-5v8')}
    </>
  ),
  tram: (
    <>
      <Rect x="5" y="6" width="14" height="12" rx="3" />
      {P('M5 12h14M9 3h6M12 3v3M8 21l1.5-3M16 21l-1.5-3')}
    </>
  ),
  walk: (
    <>
      <Circle cx="13" cy="4.5" r="1.8" />
      {P('M10.5 21l1.8-6.5M12.3 14.5l2.7 2.5v4M9 11.5l1.5-3.5 3-1 2 3.5 2.5 1M12.3 14.5l1-5')}
    </>
  ),
  chevronR: P('m9 6 6 6-6 6'),
  chevronL: P('m15 6-6 6 6 6'),
  locate: (
    <>
      <Circle cx="12" cy="12" r="7" />
      <Circle cx="12" cy="12" r="2.5" />
      {P('M12 2v3M12 19v3M2 12h3M19 12h3')}
    </>
  ),
  cloudCheck: (
    <>
      {P('M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z')}
      {P('m9.5 13.5 2 2 3.5-3.5')}
    </>
  ),
  moon: P('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'),
  download: P('M12 4v11M7 10l5 5 5-5M5 20h14'),
  trash: P('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'),
  globe: (
    <>
      <Circle cx="12" cy="12" r="9" />
      {P('M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18')}
    </>
  ),
  check: P('m5 12.5 4.5 4.5L19 7.5'),
  refresh: P('M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7'),
  x: P('M6 6l12 12M18 6 6 18'),
  star: P('m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'),
  chevronD: P('m6 9 6 6 6-6'),
  plus: P('M12 5v14M5 12h14'),
  map: P('m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15'),
  minus: P('M5 12h14'),
  swap: P('M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4'),
  clock: (
    <>
      <Circle cx="12" cy="12" r="9" />
      {P('M12 7v5l3 2')}
    </>
  ),
  flag: P('M5 21V4M5 4h12l-2 4 2 4H5'),
  bell: P('M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4'),
  // Rodzaje miejsc w wyszukiwarce (OpenStreetMap)
  bed: P('M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5h.01'),
  umbrella: P('M3 12a9 9 0 0 1 18 0zM12 12v6.5a2.5 2.5 0 0 1-5 0M12 3v0'),
  church: P('M12 2v4M10 4h4M6 21V11l6-4 6 4v10zM10 21v-4a2 2 0 0 1 4 0v4'),
  school: P('M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6'),
  medical: P('M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'),
  cup: P('M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zM17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2'),
  cart: (
    <>
      {P('M3 4h2l2.5 11h10.5l2-8H6.5')}
      <Circle cx="9" cy="19.5" r="1.5" />
      <Circle cx="17" cy="19.5" r="1.5" />
    </>
  ),
  plane: P(
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ),
  // Współpraca i „Co nowego” (projekt: canvas „Współpraca”, „Profil”)
  qr: (
    <>
      <Rect x="3" y="3" width="7" height="7" rx="1" />
      <Rect x="14" y="3" width="7" height="7" rx="1" />
      <Rect x="3" y="14" width="7" height="7" rx="1" />
      {P('M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3')}
    </>
  ),
  camera: (
    <>
      {P('M4 8h3l2-3h6l2 3h3v11H4z')}
      <Circle cx="12" cy="13" r="3.5" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="4" width="18" height="16" rx="2.5" />
      <Circle cx="9" cy="9.5" r="1.8" />
      {P('m21 16-5.5-5.5L5 20')}
    </>
  ),
  mail: (
    <>
      <Rect x="3" y="5" width="18" height="14" rx="2" />
      {P('m3 7 9 6 9-6')}
    </>
  ),
  people: (
    <>
      <Circle cx="9" cy="8" r="3.5" />
      {P('M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6')}
    </>
  ),
  news: P('M4 5h13v14a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1zM17 9h3v10a2 2 0 0 1-4 0M8 9h5M8 13h5M8 17h3'),
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color = '#0E2463',
  stroke = 2,
  fill = 'none',
}: {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
  fill?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={I18nManager.isRTL && MIRRORED.has(name) ? MIRROR : undefined}>
      {ICONS[name]}
    </Svg>
  );
}

/** W układzie od prawej (hebrajski) „wstecz” i „dalej” wskazują w drugą stronę. */
const MIRRORED = new Set<IconName>(['chevronL', 'chevronR']);
const MIRROR = { transform: [{ scaleX: -1 }] };

export const MODE_ICON: Record<string, IconName> = {
  bus: 'bus',
  trolleybus: 'bus',
  ferry: 'ferry',
  rail: 'rail',
  metro: 'metro',
  tram: 'tram',
};
