// Powitanie, krok 3: wykryty region (projekt: canvas „Region”) albo wybór z listy.
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { mb, RegionList } from '@/components/RegionList';
import { Button, PanoramaHeader, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import type { PackageInfo } from '@/data/packages';
import { getLang, t, useLang } from '@/i18n';
import { setHomeRegion, setOnboarded } from '@/lib/settings';
import { formatDate } from '@/lib/time';

export default function RegionStep() {
  useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const params = useLocalSearchParams<{ lat?: string; lon?: string }>();
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(false);

  const p = params.lat && params.lon ? { lat: Number(params.lat), lon: Number(params.lon) } : null;
  const detected = p ? data.regionsAt(p)[0] : undefined;
  const busy = Object.values(data.busy).some(Boolean);

  // Pobranie regionu i koniec powitania – układ przełączy się sam na zakładki (Stack.Protected).
  const start = async (pkg: PackageInfo) => {
    setError(false);
    try {
      if (!data.installed[pkg.region]) await data.install(pkg.region);
      setHomeRegion(pkg.region);
      setOnboarded();
    } catch {
      setError(true);
    }
  };

  const groupName = (region: string) => {
    const g = data.groups?.find((x) => x.regions.some((r) => r.id === region));
    const lang = getLang();
    return g ? (lang === 'pl' || lang === 'el' ? g.name[lang] : g.name.en) : null;
  };
  const greekName = (region: string) => data.groups?.flatMap((g) => g.regions).find((r) => r.id === region)?.name.el ?? null;

  const errorText = error ? (
    <Txt w="bold" color={C.orangeText} style={{ textAlign: 'center' }}>
      {t('errorGeneric')}
    </Txt>
  ) : null;

  // Brak listy regionów (np. bez internetu przy pierwszym uruchomieniu).
  if (!data.manifest) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top + 16 }]}>
        {data.manifestError ? (
          <View style={[s.card, { padding: 18, gap: 12, marginHorizontal: 24 }]}>
            <Txt w="bold" size={16} color={C.text2}>
              {t('manifestError')}
            </Txt>
            <Button title={t('retry')} icon="refresh" onPress={data.refresh} />
            <Button title={t('skip')} kind="text" onPress={() => setOnboarded()} />
          </View>
        ) : (
          <ActivityIndicator color={C.blue} size="large" />
        )}
      </View>
    );
  }

  if (detected && !choosing) {
    const name = data.regionName(detected.region);
    const installed = !!data.installed[detected.region];
    return (
      <View style={[s.screen, { paddingTop: insets.top + 16 }]}>
        <ScrollView contentContainerStyle={s.body}>
          <Logo />
          <View style={[s.row, { marginTop: 24 }]}>
            <Icon name="locate" size={18} color={C.blue} stroke={2.2} />
            <Txt w="extrabold" size={14} color={C.blue}>
              {t('locDetected')}
            </Txt>
          </View>
          <Txt w="black" size={32} color={C.ink} style={{ lineHeight: 36 }}>
            {t('regionDetected', { name })}
          </Txt>
          <Txt w="semibold" size={16} color={C.muted} style={{ lineHeight: 23 }}>
            {t('regionDownloadBody')}
          </Txt>

          <View style={[s.card, { marginTop: 8 }]}>
            <PanoramaHeader region={detected.region} height={84} style={{ height: 112 }}>
              <View style={{ padding: 18 }}>
                <Txt w="black" size={24} color={C.ink}>
                  {name}
                </Txt>
                <Txt w="bold" size={14} color={C.text2}>
                  {[groupName(detected.region), greekName(detected.region)].filter(Boolean).join(' · ')}
                </Txt>
              </View>
            </PanoramaHeader>
            <View style={{ padding: 16, gap: 14 }}>
              <View style={s.stats}>
                <Stat value={String(detected.routes)} label={t('statLines')} />
                <Stat value={String(detected.stations)} label={t('statStops')} />
                <Stat value={mb(detected.bytes)} label={t('statMb')} />
              </View>
              <View style={s.row}>
                <Icon name="bus" size={20} color={C.blue} />
                <Txt w="bold" size={15} color={C.text2}>
                  {t('timetableValid', { date: formatDate(Number(detected.valid_to)) })}
                </Txt>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
          {errorText}
          <Txt w="semibold" size={14} color={C.muted} style={{ textAlign: 'center' }}>
            {t('regionMoreLater')}
          </Txt>
          <Button
            title={installed ? t('regionStartInstalled') : busy ? t('downloading') : t('regionStart', { name })}
            icon={installed ? 'chevronR' : 'download'}
            loading={busy}
            onPress={() => start(detected)}
          />
          <Button title={t('regionOther')} kind="text" disabled={busy} onPress={() => setChoosing(true)} />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top + 16 }]}>
      <ScrollView contentContainerStyle={s.body}>
        <Logo />
        <Txt w="black" size={30} color={C.ink} style={{ marginTop: 20 }}>
          {t('chooseRegion')}
        </Txt>
        <Txt w="semibold" size={16} color={C.muted} style={{ lineHeight: 23 }}>
          {p && !detected ? t('regionOutsidePick') : t('regionPickSub')}
        </Txt>
        {errorText}
        <View style={[s.card, { marginTop: 8 }]}>
          <RegionList
            withOverlays={false}
            onPick={(pkg) => !busy && start(pkg)}
            right={(pkg) =>
              data.busy[pkg.region] ? (
                <ActivityIndicator color={C.blue} />
              ) : (
                <Icon name={data.installed[pkg.region] ? 'check' : 'download'} size={22} color={data.installed[pkg.region] ? C.green : C.blue} stroke={2.4} />
              )
            }
          />
        </View>
        <Button title={t('skip')} kind="text" disabled={busy} onPress={() => setOnboarded()} />
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Txt w="black" size={22} color={C.blue}>
        {value}
      </Txt>
      <Txt w="bold" size={13} color={C.muted}>
        {label}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'stretch', justifyContent: 'center' },
  body: { paddingHorizontal: 24, paddingBottom: 24, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', ...shadow },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: C.bg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  bottom: { paddingHorizontal: 24, paddingTop: 8, gap: 8 },
});
