// Kolory i typografia OpaBus – zgodne z projektem ekranów (canvas Design) i CLAUDE.md.

export const C = {
  blue: '#1E4FD8', // główny royal blue
  navy: '#0B2A7A', // przyciski główne
  ink: '#0E2463', // nagłówki
  text: '#0F1B3D',
  text2: '#3E4A68',
  muted: '#56617F',
  faint: '#8A94AE',
  bg: '#F3F6FD',
  header: '#E9F0FF',
  card: '#FFFFFF',
  line: '#E3E9F7',
  lineSoft: '#EEF2FC',
  sky: '#E6EEFF',
  orangeBg: '#FFF0DA',
  orangeLine: '#FAD29B',
  orange: '#E07B00',
  orangeText: '#9A4A00',
  orangeDeep: '#7A3A00',
  greenBg: '#E2F5EB',
  green: '#0E6B45',
  roda: '#0E7A5F',
  yellow: '#FFC928',
  tabInactive: '#5E6886',
} as const;

/** Kolor plakietki linii, gdy paczka nie podaje własnego: KTEL niebieski, miejskie zielone, inne rodzaje osobno. */
export function lineColor(color: string | null, agencyCode: string, mode: string): string {
  if (color && color.length >= 4) return color;
  if (mode === 'ferry') return '#0B6FA4';
  if (mode === 'rail') return '#5B3BB5';
  if (mode === 'metro' || mode === 'tram') return '#B4234A';
  return /KTEL/i.test(agencyCode) ? C.blue : C.roda;
}

export const F = {
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

export const radius = { card: 16, big: 20, pill: 999 } as const;

export const shadow = {
  shadowColor: '#0E2463',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
