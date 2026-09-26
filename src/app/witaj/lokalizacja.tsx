// Powitanie, krok 2: zgoda na lokalizację albo wybór ręczny (projekt: canvas „Lokalizacja”).
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Button, Pill, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { t, useLang } from '@/i18n';
import { POSITION_OPTIONS } from '@/lib/position';

// Ilustracja: fragment mapy, pinezka „tu jesteś” i przystanek autobusowy.
const MAP = `<svg viewBox="0 0 390 360" xmlns="http://www.w3.org/2000/svg">
<rect width="390" height="360" fill="#F1F5FF"/>
<path d="M270 0 H390 V150 Q350 130 330 90 T270 0Z" fill="#CFE0FF"/>
<g fill="#E1E9FB"><rect x="20" y="30" width="80" height="60" rx="8"/><rect x="120" y="30" width="110" height="60" rx="8"/><rect x="20" y="118" width="60" height="90" rx="8"/><rect x="20" y="236" width="120" height="100" rx="8"/><rect x="170" y="236" width="90" height="100" rx="8"/><rect x="290" y="236" width="90" height="100" rx="8"/><rect x="300" y="170" width="80" height="40" rx="8"/></g>
<g fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round"><path d="M0 104 H280 Q300 104 310 120 L330 150"/><path d="M0 222 H390"/><path d="M155 104 V360"/></g>
<path d="M118 196 C150 196 170 150 210 150 S262 160 282 176" fill="none" stroke="#1E4FD8" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8"/>
<circle cx="112" cy="176" r="52" fill="#1E4FD8" fill-opacity="0.08"/><circle cx="112" cy="176" r="32" fill="#1E4FD8" fill-opacity="0.14"/>
<path d="M112 206 C112 206 88 182 88 164 a24 24 0 0 1 48 0 C136 182 112 206 112 206Z" fill="#1E4FD8"/><circle cx="112" cy="164" r="9" fill="#FFFFFF"/>
<rect x="283" y="130" width="6" height="120" rx="3" fill="#0B2A7A"/><ellipse cx="286" cy="250" rx="18" ry="5" fill="#C9D8FF"/>
<circle cx="286" cy="112" r="32" fill="#1E4FD8"/><circle cx="286" cy="112" r="32" fill="none" stroke="#FFFFFF" stroke-width="4"/>
<g fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="272" y="96" width="28" height="26" rx="5"/><path d="M272 110 H300 M278 122 V127 M294 122 V127"/></g>
<g fill="#9DB8F7"><path d="M330 250 c-4 -22 6 -38 16 -44 c-2 16 -6 30 -16 44Z"/><path d="M334 250 c8 -16 22 -22 32 -20 c-8 10 -20 18 -32 20Z"/></g>
</svg>`;

/** Pozycja z telefonu: najpierw ostatnia znana (szybko), potem bieżąca – maks. 10 s. */
async function currentPosition(): Promise<{ lat: number; lon: number } | null> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null);
  if (last) return { lat: last.coords.latitude, lon: last.coords.longitude };
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));
  const cur = await Promise.race([Location.getCurrentPositionAsync(POSITION_OPTIONS).catch(() => null), timeout]);
  return cur ? { lat: cur.coords.latitude, lon: cur.coords.longitude } : null;
}

export default function LocationStep() {
  useLang();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      const p = perm.granted ? await currentPosition() : null;
      router.push(p ? { pathname: '/witaj/region', params: { lat: String(p.lat), lon: String(p.lon) } } : '/witaj/region');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <View style={[s.logo, { top: insets.top + 16 }]}>
        <Logo />
      </View>
      <View style={s.art}>
        <SvgXml xml={MAP} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
      </View>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={s.titleRow}>
          <Icon name="pin" size={30} color={C.blue} stroke={2.2} />
          <Txt w="black" size={28} color={C.ink} style={{ flex: 1 }}>
            {t('locTitle')}
          </Txt>
        </View>
        <Txt w="semibold" size={16} color={C.muted} style={{ lineHeight: 23, marginBottom: 8 }}>
          {t('locBody')}
        </Txt>
        <Button title={t('locAllow')} icon="locate" loading={busy} onPress={allow} />
        <Button title={t('locManual')} icon="bus" kind="outline" disabled={busy} onPress={() => router.push('/witaj/region')} />
        <View style={s.offline}>
          <Pill icon="cloudCheck" text={t('offlineWorks')} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.header },
  logo: { position: 'absolute', left: 24, zIndex: 2 },
  art: { flex: 1, marginTop: 90, marginBottom: -28 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 12,
    shadowColor: '#0E2463',
    shadowOpacity: 0.1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offline: { alignItems: 'center', marginTop: 6 },
});
