// Lista regionów do pobrania, pogrupowana jak na stronie (regions.json). Używana w Profilu i na ekranie powitalnym.
// Tu także pasek postępu pobierania rozkładów regionu (lista, Start, wybór regionu, Profil).
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { C } from '@/constants/theme';
import { OVERLAY_REGIONS, useData } from '@/data/DataContext';
import type { PackageInfo } from '@/data/packages';
import { decimal, getLang, t } from '@/i18n';
import { formatDate } from '@/lib/time';

import { Icon } from './Icon';
import { Txt } from './ui';

/** Rozmiar paczki: „89 KB”, „1,4 MB”. */
export const fileSize = (bytes: number) =>
  bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${decimal((bytes / 1e6).toFixed(1))} MB`;

/** Pasek postępu pobierania rozkładów regionu – jak w wierszu „Mapa offline”; widoczny tylko w trakcie pobierania. */
export function PackageProgress({ region, style }: { region: string; style?: StyleProp<ViewStyle> }) {
  const data = useData();
  const part = data.progress[region];
  if (!data.busy[region] || part === undefined) return null;
  const pct = Math.round(part * 100);
  const text = t('pkgDownloading', { pct, size: fileSize(data.manifest?.packages.find((p) => p.region === region)?.bytes ?? 0) });
  return (
    <View
      style={[s.progress, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      accessibilityLabel={`${data.regionName(region)}: ${text}`}>
      <Txt w="bold" size={14} color={C.text2}>
        {text}
      </Txt>
      <View style={s.bar}>
        <View style={[s.barFill, { width: `${Math.max(3, pct)}%` }]} />
      </View>
    </View>
  );
}

export function RegionList({
  right,
  onPick,
  withOverlays = true,
}: {
  /** Element po prawej stronie wiersza (np. przycisk pobierania). */
  right: (p: PackageInfo) => ReactNode;
  /** Dotknięcie całego wiersza. */
  onPick?: (p: PackageInfo) => void;
  /** Czy pokazywać paczki ogólnokrajowe (kolej, promy) w grupie „Inne”. */
  withOverlays?: boolean;
}) {
  const data = useData();
  const [open, setOpen] = useState<string | null>(null);
  const lang = getLang();

  const pkgs = new Map((data.manifest?.packages ?? []).filter((p) => withOverlays || !OVERLAY_REGIONS.has(p.region)).map((p) => [p.region, p]));
  // Grupy z regions.json; paczki spoza listy (np. kolej, promy) trafiają do „Inne”.
  const listed = new Set<string>();
  const groups = (data.groups ?? []).map((g) => {
    const items = g.regions.filter((r) => pkgs.has(r.id)).map((r) => pkgs.get(r.id)!);
    items.forEach((p) => listed.add(p.region));
    return { id: g.id, name: lang === 'pl' || lang === 'el' ? g.name[lang] : g.name.en, items };
  });
  const rest = [...pkgs.values()].filter((p) => !listed.has(p.region));
  if (rest.length) groups.push({ id: '_other', name: 'Inne / Other', items: rest });

  return (
    <>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <View key={g.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open === g.id }}
              onPress={() => setOpen((x) => (x === g.id ? null : g.id))}
              style={s.groupRow}>
              <Txt w="black" size={15} color={C.ink} style={{ flex: 1 }}>
                {g.name}
              </Txt>
              <Txt w="bold" size={13} color={C.muted}>
                {g.items.length}
              </Txt>
              <Icon name={open === g.id ? 'chevronD' : 'chevronR'} size={18} color={C.faint} />
            </Pressable>
            {open === g.id
              ? g.items.map((p) => (
                  <Pressable
                    key={p.region}
                    accessibilityRole={onPick ? 'button' : undefined}
                    disabled={!onPick}
                    onPress={() => onPick?.(p)}
                    style={({ pressed }) => [s.regionRow, pressed && { backgroundColor: C.sky }]}>
                    <View style={{ flex: 1 }}>
                      <Txt w="extrabold" size={16} color={C.ink}>
                        {data.regionName(p.region)}
                      </Txt>
                      {data.busy[p.region] && data.progress[p.region] !== undefined ? (
                        <PackageProgress region={p.region} style={{ marginTop: 4 }} />
                      ) : (
                        <Txt w="bold" size={13} color={C.muted}>
                          {[t('validTo', { date: formatDate(Number(p.valid_to)) }), fileSize(p.bytes)].join(' · ')}
                        </Txt>
                      )}
                    </View>
                    {right(p)}
                  </Pressable>
                ))
              : null}
          </View>
        ))}
    </>
  );
}

const s = StyleSheet.create({
  progress: { gap: 4 },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.sky, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: C.blue },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
});
