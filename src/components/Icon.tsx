// Ikony liniowe (styl z projektu ekranów). Nazwa → ścieżki SVG w siatce 24×24.
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
      strokeLinejoin="round">
      {ICONS[name]}
    </Svg>
  );
}

export const MODE_ICON: Record<string, IconName> = {
  bus: 'bus',
  trolleybus: 'bus',
  ferry: 'ferry',
  rail: 'rail',
  metro: 'metro',
  tram: 'tram',
};
