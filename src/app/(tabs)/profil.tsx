// Profil – język, regiony offline (pobieranie, aktualizacja, usuwanie), źródła danych.
import Constants from 'expo-constants';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, PanoramaHeader, Pill, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import type { PackageInfo } from '@/data/packages';
import { hasTranslation, LANGS, setLang, t, useLang } from '@/i18n';
import { formatDate } from '@/lib/time';

const mb = (bytes: number) => (bytes / 1e6 < 0.1 ? '<0,1' : (bytes / 1e6).toFixed(1).replace('.', ','));

export default function ProfileScreen() {
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const [showLangs, setShowLangs] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const pkgs = new Map((data.manifest?.packages ?? []).map((p) => [p.region, p]));
  const installed = Object.values(data.installed).sort((a, b) => data.regionName(a.region).localeCompare(data.regionName(b.region)));

  // Grupy z regions.json; paczki spoza listy (np. kolej, promy) trafiają do „Inne”.
  const listed = new Set<string>();
  const groups = (data.groups ?? []).map((g) => {
    const items = g.regions.filter((r) => pkgs.has(r.id)).map((r) => pkgs.get(r.id)!);
    items.forEach((p) => listed.add(p.region));
    return { id: g.id, name: lang === 'pl' || lang === 'el' ? g.name[lang] : g.name.en, items };
  });
  const rest = [...pkgs.values()].filter((p) => !listed.has(p.region));
  if (rest.length) groups.push({ id: '_other', name: 'Inne / Other', items: rest });

  const row = (p: PackageInfo) => {
    const inst = data.installed[p.region];
    const busy = data.busy[p.region];
    return (
      <View key={p.region} style={s.regionRow}>
        <View style={{ flex: 1 }}>
          <Txt w="extrabold" size={16} color={C.ink}>
            {data.regionName(p.region)}
          </Txt>
          <Txt w="bold" size={13} color={C.muted}>
            {[t('validTo', { date: formatDate(Number(p.valid_to)) }), t('sizeMb', { mb: mb(p.bytes) })].join(' · ')}
          </Txt>
        </View>
        {busy ? (
          <ActivityIndicator color={C.blue} />
        ) : inst ? (
          <Icon name="check" size={22} color={C.green} stroke={2.6} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('download')} ${data.regionName(p.region)}`} onPress={() => data.install(p.region)} style={s.dl}>
            <Icon name="download" size={20} color={C.blue} stroke={2.4} />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <PanoramaHeader height={64} style={{ paddingTop: insets.top + 14, paddingBottom: 48 }}>
        <Txt w="black" size={30} color={C.ink} style={{ paddingHorizontal: 24 }}>
          {t('profileTitle')}
        </Txt>
        <View style={{ paddingHorizontal: 24, paddingTop: 6, flexDirection: 'row' }}>
          <Pill icon="check" text={t('noAccount')} />
        </View>
      </PanoramaHeader>

      <ScrollView contentContainerStyle={s.body}>
        <View style={s.card}>
          <Pressable accessibilityRole="button" onPress={() => setShowLangs((x) => !x)} style={s.menuRow}>
            <Icon name="globe" size={22} color={C.blue} />
            <Txt w="extrabold" size={16} color={C.ink} style={{ flex: 1 }}>
              {t('language')}
            </Txt>
            <Txt w="bold" color={C.muted}>
              {LANGS.find((l) => l.code === lang)?.name}
            </Txt>
          </Pressable>
          {showLangs
            ? LANGS.map((l) => (
                <Pressable
                  key={l.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: l.code === lang }}
                  onPress={() => setLang(l.code)}
                  style={[s.langRow, l.code === lang && { backgroundColor: C.sky }]}>
                  <Txt w="bold" size={16} style={{ flex: 1 }}>
                    {l.name}
                  </Txt>
                  {!hasTranslation(l.code) ? (
                    <Txt w="semibold" size={12} color={C.muted}>
                      {t('translationSoon')}
                    </Txt>
                  ) : null}
                  {l.code === lang ? <Icon name="check" size={20} color={C.blue} stroke={2.6} /> : null}
                </Pressable>
              ))
            : null}
        </View>

        <Txt w="black" size={13} color={C.muted} style={s.section}>
          {t('regionsOffline').toUpperCase()}
        </Txt>

        {data.manifestError && !data.manifest ? (
          <View style={[s.card, { padding: 14, gap: 10 }]}>
            <Txt w="bold" color={C.text2}>
              {t('manifestError')}
            </Txt>
            <Button title={t('retry')} kind="outline" icon="refresh" onPress={data.refresh} />
          </View>
        ) : null}

        {installed.length > 0 ? (
          <View style={s.card}>
            <Txt w="black" size={13} color={C.muted} style={s.cardLabel}>
              {t('inPhone')}
            </Txt>
            {installed.map((i) => (
              <View key={i.region} style={s.regionRow}>
                <View style={{ flex: 1 }}>
                  <Txt w="extrabold" size={16} color={C.ink}>
                    {data.regionName(i.region)}
                  </Txt>
                  <Txt w="bold" size={13} color={C.muted}>
                    {[t('validTo', { date: formatDate(i.validTo) }), data.hasUpdate(i.region) ? null : t('upToDate')].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                {data.busy[i.region] ? (
                  <ActivityIndicator color={C.blue} />
                ) : data.hasUpdate(i.region) ? (
                  <Pressable accessibilityRole="button" onPress={() => data.install(i.region)} style={s.dl}>
                    <Icon name="refresh" size={20} color={C.blue} stroke={2.4} />
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('remove')} ${data.regionName(i.region)}`} onPress={() => data.remove(i.region)} style={s.del}>
                  <Icon name="trash" size={20} color={C.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {data.manifest ? (
          <View style={s.card}>
            <Txt w="black" size={13} color={C.muted} style={s.cardLabel}>
              {t('available')}
            </Txt>
            {groups.map((g) => (
              <View key={g.id}>
                <Pressable accessibilityRole="button" onPress={() => setOpenGroup((x) => (x === g.id ? null : g.id))} style={s.groupRow}>
                  <Txt w="black" size={15} color={C.ink} style={{ flex: 1 }}>
                    {g.name}
                  </Txt>
                  <Txt w="bold" size={13} color={C.muted}>
                    {g.items.length}
                  </Txt>
                  <Icon name={openGroup === g.id ? 'chevronL' : 'chevronR'} size={18} color={C.faint} />
                </Pressable>
                {openGroup === g.id ? g.items.map(row) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Txt w="semibold" size={12} color={C.muted} style={{ textAlign: 'center', marginTop: 8 }}>
          {t('dataSources')}
        </Txt>
        <Txt w="semibold" size={12} color={C.muted} style={{ textAlign: 'center' }}>
          {t('version', { v: Constants.expoConfig?.version ?? '' })}
        </Txt>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', ...shadow },
  cardLabel: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  section: { paddingHorizontal: 8, marginTop: 8, letterSpacing: 0.8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.lineSoft },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
  dl: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  del: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
});
