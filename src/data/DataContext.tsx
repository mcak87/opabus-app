// Stan danych w aplikacji: manifest paczek, lista regionów, zainstalowane paczki.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getLang } from '@/i18n';
import { bboxArea, inBbox, type LatLon } from '@/lib/geo';

import {
  cachedManifest,
  cachedRegionGroups,
  fetchManifest,
  fetchRegionGroups,
  installPackage,
  listInstalled,
  removePackage,
  type Installed,
  type Manifest,
  type PackageInfo,
  type RegionGroup,
} from './packages';

/** Paczki obejmujące całą Grecję – dokładamy je do regionu, a nie wybieramy jako region. */
export const OVERLAY_REGIONS = new Set(['kolej', 'promy']);

type DataState = {
  manifest: Manifest | null;
  groups: RegionGroup[] | null;
  installed: Record<string, Installed>;
  manifestError: boolean;
  busy: Record<string, boolean>;
  refresh: () => Promise<void>;
  install: (region: string) => Promise<void>;
  remove: (region: string) => Promise<void>;
  regionName: (region: string) => string;
  /** Regiony (bez paczek ogólnokrajowych), których obszar obejmuje punkt – od najmniejszego. */
  regionsAt: (p: LatLon) => PackageInfo[];
  hasUpdate: (region: string) => boolean;
};

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(() => cachedManifest());
  const [groups, setGroups] = useState<RegionGroup[] | null>(() => cachedRegionGroups());
  const [installed, setInstalled] = useState<Record<string, Installed>>(() => listInstalled());
  const [manifestError, setManifestError] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(async () => setRefreshTick((x) => x + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchManifest(), fetchRegionGroups().catch(() => null)])
      .then(([m, g]) => {
        if (!alive) return;
        setManifest(m);
        if (g) setGroups(g);
        setManifestError(false);
      })
      .catch(() => alive && setManifestError(true));
    return () => {
      alive = false;
    };
  }, [refreshTick]);

  const install = useCallback(
    async (region: string) => {
      const pkg = manifest?.packages.find((p) => p.region === region);
      if (!pkg || !manifest) return;
      setBusy((b) => ({ ...b, [region]: true }));
      try {
        await installPackage(pkg, manifest.schema);
        setInstalled(listInstalled());
      } finally {
        setBusy((b) => ({ ...b, [region]: false }));
      }
    },
    [manifest],
  );

  const remove = useCallback(async (region: string) => {
    await removePackage(region);
    setInstalled(listInstalled());
  }, []);

  const value = useMemo<DataState>(() => {
    const names = new Map<string, RegionGroup['regions'][number]['name']>();
    groups?.forEach((g) => g.regions.forEach((r) => names.set(r.id, r.name)));
    return {
      manifest,
      groups,
      installed,
      manifestError,
      busy,
      refresh,
      install,
      remove,
      regionName: (region) => {
        const n = names.get(region);
        if (!n) return region.charAt(0).toUpperCase() + region.slice(1).replace(/_/g, ' ');
        const lang = getLang();
        return lang === 'pl' || lang === 'el' ? n[lang] : n.en;
      },
      regionsAt: (p) =>
        (manifest?.packages ?? [])
          .filter((pkg) => !OVERLAY_REGIONS.has(pkg.region) && inBbox(p, pkg.bbox))
          .sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox)),
      hasUpdate: (region) => {
        const pkg = manifest?.packages.find((p) => p.region === region);
        return !!pkg && !!installed[region] && installed[region].version !== pkg.version;
      },
    };
  }, [manifest, groups, installed, manifestError, busy, refresh, install, remove]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData poza DataProvider');
  return v;
}
