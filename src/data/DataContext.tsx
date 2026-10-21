// Stan danych w aplikacji: manifest paczek, lista regionów, zainstalowane paczki i ich aktualizacja.
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getLang } from '@/i18n';
import { bboxArea, inBbox, type LatLon } from '@/lib/geo';
import { onUnmeteredNetwork } from '@/lib/network';
import { getSettings, replaceFavorites, setHomeRegion } from '@/lib/settings';

import { refreshAppConfig } from './appConfig';
import { favoriteKey, refreshFavorite, type Favorite } from './favorites';
import { refreshNews } from './news';
import { flushReports } from './punctuality';
import { fetchFares, removeFares } from './fares';
import { removePlaces, syncPlaces } from './places';
import { deleteMap, downloadMap, loadMapPacks } from './offlineMaps';
import {
  cachedManifest,
  cachedRegionGroups,
  fetchManifest,
  fetchRegionGroups,
  installPackage,
  InstallError,
  listInstalled,
  openRegion,
  removePackage,
  SUPPORTED_SCHEMA,
  type InstallFailure,
  type Installed,
  type Manifest,
  type PackageInfo,
  type RegionGroup,
} from './packages';

/** Paczki obejmujące całą Grecję – dokładamy je do regionu, a nie wybieramy jako region. */
export const OVERLAY_REGIONS = new Set(['kolej', 'promy']);

/**
 * Nowsze wersje paczek do tej wielkości instalujemy same przy każdym połączeniu (prawie wszystkie regiony mają ok. 100 KB).
 * Większe – Ateny ok. 5 MB, Saloniki ok. 2,4 MB – tylko przez Wi-Fi, żeby nie zjadać pakietu danych w roamingu.
 */
export const AUTO_UPDATE_MAX_CELLULAR_BYTES = 1_000_000;
/** Po powrocie do aplikacji sprawdzamy nowe rozkłady najwyżej co tyle („pociągnij, by odświeżyć” – zawsze). */
const FOREGROUND_REFRESH_MS = 10 * 60_000;

/**
 * Promy i kolej (razem ok. 100 KB) pobieramy same, gdy w telefonie jest już jakiś region – planer łączy je z autobusami
 * (Faliraki → Symi, Ateny → Egina). Tylko raz: kto usunie je potem w Profilu, ten ich z powrotem nie dostanie.
 */
const K_OVERLAYS_AUTO = 'data.overlaysAuto.v1';
let overlaysJob: Promise<boolean> | null = null;
function autoInstallOverlays(m: Manifest): Promise<boolean> {
  // Jedno pobieranie naraz (start aplikacji i instalacja regionu mogą wywołać to równocześnie).
  overlaysJob ??= (async () => {
    if (Storage.getItemSync(K_OVERLAYS_AUTO)) return false;
    const all = listInstalled();
    if (!Object.keys(all).some((r) => !OVERLAY_REGIONS.has(r))) return false;
    for (const pkg of m.packages.filter((p) => OVERLAY_REGIONS.has(p.region) && !all[p.region])) await installPackage(pkg, m.schema);
    Storage.setItemSync(K_OVERLAYS_AUTO, '1');
    await syncFavorites().catch(() => {});
    return true;
  })().finally(() => {
    overlaysJob = null;
  });
  return overlaysJob;
}

/**
 * Ulubione → numery stacji w zainstalowanych paczkach (numery zmieniają się przy każdej przebudowie paczki, kody słupków nie).
 * Po instalacji nowej wersji regionu i przy starcie: wpisy przeniesione ze starej wersji aplikacji, przerwana aktualizacja.
 * Ulubione z regionów, których nie ma w telefonie, czekają na ich pobranie.
 */
async function syncFavorites(region?: string): Promise<void> {
  const installed = listInstalled();
  const stale = getSettings().favorites.filter((f) => (!region || f.region === region) && installed[f.region] && installed[f.region].version !== f.version);
  const fixed = new Map<string, Favorite>();
  for (const f of stale) {
    try {
      const { db } = await openRegion(f.region);
      fixed.set(favoriteKey(f), await refreshFavorite(db, f, installed[f.region].version));
    } catch {
      // baza regionu się nie otworzyła – spróbujemy przy następnym starcie
    }
  }
  replaceFavorites(fixed);
}

type DataState = {
  manifest: Manifest | null;
  groups: RegionGroup[] | null;
  installed: Record<string, Installed>;
  manifestError: boolean;
  busy: Record<string, boolean>;
  /** Postęp pobierania rozkładów regionu 0…1 – tylko w trakcie pobierania. */
  progress: Record<string, number>;
  /** Ostatnie pobieranie regionu się nie udało (czyści się przy następnej próbie). */
  failed: Record<string, InstallFailure>;
  /** Sprawdza nowe rozkłady (i instaluje nowsze wersje regionów w telefonie). */
  refresh: () => Promise<void>;
  /** Pobiera rozkłady regionu; withMap – od razu także mapę offline (w tle). Błąd: InstallError, zapisany też w `failed`. */
  install: (region: string, opts?: { withMap?: boolean }) => Promise<void>;
  remove: (region: string) => Promise<void>;
  regionName: (region: string) => string;
  /** Regiony (bez paczek ogólnokrajowych), których obszar obejmuje punkt – od najmniejszego. */
  regionsAt: (p: LatLon) => PackageInfo[];
  hasUpdate: (region: string) => boolean;
  /** Nowa wersja jest, ale duża – sama pobierze się dopiero przez Wi-Fi. */
  updateWaitsForWifi: (region: string) => boolean;
};

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(() => cachedManifest());
  const [groups, setGroups] = useState<RegionGroup[] | null>(() => cachedRegionGroups());
  const [installed, setInstalled] = useState<Record<string, Installed>>(() => listInstalled());
  const [manifestError, setManifestError] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<Record<string, InstallFailure>>({});

  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(async () => setRefreshTick((x) => x + 1), []);
  /** Kiedy ostatnio udało się pobrać manifest (0 = jeszcze nie w tym uruchomieniu). */
  const lastCheck = useRef(0);
  const updating = useRef(false);

  const runInstall = useCallback(async (m: Manifest, pkg: PackageInfo, opts?: { withMap?: boolean }) => {
    const region = pkg.region;
    setBusy((b) => ({ ...b, [region]: true }));
    setProgress((x) => ({ ...x, [region]: 0 }));
    setFailed(({ [region]: _old, ...rest }) => rest);
    let shown = 0;
    try {
      await installPackage(pkg, m.schema, (part) => {
        // Co najmniej 2 punkty procentowe – bez setState przy każdym kawałku pliku.
        if (part - shown < 0.02 && part < 1) return;
        shown = part;
        setProgress((x) => ({ ...x, [region]: part }));
      });
      // Najpierw ulubione na nowe numery stacji – ekrany nie mogą zobaczyć nowej paczki ze starymi numerami.
      await syncFavorites(region).catch(() => {});
      fetchFares(region).catch(() => {});
      syncPlaces([region]).catch(() => {});
      const all = listInstalled();
      setInstalled(all);
      // Pierwszy pobrany region staje się „domowym” dla ekranu Start bez lokalizacji.
      const home = getSettings().homeRegion;
      if (!OVERLAY_REGIONS.has(region) && (!home || !all[home])) setHomeRegion(region);
      if (opts?.withMap && !OVERLAY_REGIONS.has(region)) downloadMap(region, pkg.bbox).catch(() => {});
      autoInstallOverlays(m)
        .then((added) => added && setInstalled(listInstalled()))
        .catch(() => {});
    } catch (e) {
      setFailed((x) => ({ ...x, [region]: e instanceof InstallError ? e.reason : 'network' }));
      throw e;
    } finally {
      setBusy((b) => ({ ...b, [region]: false }));
      setProgress(({ [region]: _done, ...rest }) => rest);
    }
  }, []);

  /**
   * Nowsze wersje regionów, które są w telefonie – same, po każdym udanym pobraniu manifestu (start, powrót do aplikacji,
   * „pociągnij, by odświeżyć”). Inaczej turysta widziałby „Czekamy na nowy rozkład”, choć nowy już jest na serwerze.
   */
  const autoUpdate = useCallback(
    async (m: Manifest) => {
      // Paczki dla nowszej wersji aplikacji i tak się nie zainstalują.
      if (updating.current || m.schema > SUPPORTED_SCHEMA) return;
      updating.current = true;
      try {
        const all = listInstalled();
        let unmetered: boolean | null = null;
        for (const pkg of m.packages.filter((p) => all[p.region] && all[p.region].version !== p.version)) {
          if (pkg.bytes > AUTO_UPDATE_MAX_CELLULAR_BYTES) {
            unmetered ??= await onUnmeteredNetwork();
            if (!unmetered) continue;
          }
          // Błąd zapisuje runInstall (widać go w Profilu i na karcie „Poza sezonem”); kolejna próba przy następnym sprawdzeniu.
          await runInstall(m, pkg).catch(() => {});
        }
      } finally {
        updating.current = false;
      }
    },
    [runInstall],
  );

  useEffect(() => {
    let alive = true;
    // Ustawienia ze strony (komunikat, minimalna wersja) i „Co nowego” – bez internetu zostaje ostatnia zapisana wersja.
    refreshAppConfig().catch(() => {});
    refreshNews().catch(() => {});
    // Zgłoszenia „czy autobus był o czasie”, które nie wyszły bez internetu.
    flushReports().catch(() => {});
    Promise.all([fetchManifest(), fetchRegionGroups().catch(() => null)])
      .then(([m, g]) => {
        if (!alive) return;
        lastCheck.current = Date.now();
        setManifest(m);
        if (g) setGroups(g);
        setManifestError(false);
        // Cenniki i miejsca (hotele, plaże, ulice…) pobranych regionów – małe pliki, odświeżane przy każdym połączeniu.
        Object.keys(listInstalled()).forEach((r) => fetchFares(r).catch(() => {}));
        syncPlaces(Object.keys(listInstalled())).catch(() => {});
        autoInstallOverlays(m)
          .then((added) => added && alive && setInstalled(listInstalled()))
          .catch(() => {})
          .then(() => autoUpdate(m))
          .catch(() => {});
      })
      .catch(() => alive && setManifestError(true));
    return () => {
      alive = false;
    };
  }, [refreshTick, autoUpdate]);

  // Powrót do aplikacji (np. rano, po nocy w tle) – nowe rozkłady i poprawki godzin bez zamykania aplikacji.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && Date.now() - lastCheck.current > FOREGROUND_REFRESH_MS) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const install = useCallback(
    async (region: string, opts?: { withMap?: boolean }) => {
      const pkg = manifest?.packages.find((p) => p.region === region);
      if (!pkg || !manifest) return;
      await runInstall(manifest, pkg, opts);
    },
    [manifest, runInstall],
  );

  useEffect(() => {
    // Mapy offline zapisane w telefonie (i wznowienie przerwanego pobierania).
    loadMapPacks().catch(() => {});
    // Ulubione zapisane przez starszą wersję aplikacji (sam numer stacji) albo sprzed przerwanej aktualizacji.
    syncFavorites().catch(() => {});
  }, []);

  const remove = useCallback(async (region: string) => {
    await removePackage(region);
    await deleteMap(region).catch(() => {});
    removeFares(region);
    removePlaces(region);
    const all = listInstalled();
    setInstalled(all);
    setFailed(({ [region]: _old, ...rest }) => rest);
    if (getSettings().homeRegion === region) {
      setHomeRegion(Object.keys(all).find((r) => !OVERLAY_REGIONS.has(r)) ?? null);
    }
  }, []);

  const value = useMemo<DataState>(() => {
    const names = new Map<string, RegionGroup['regions'][number]['name']>();
    groups?.forEach((g) => g.regions.forEach((r) => names.set(r.id, r.name)));
    const update = (region: string) => {
      const pkg = manifest?.packages.find((p) => p.region === region);
      return pkg && installed[region] && installed[region].version !== pkg.version ? pkg : null;
    };
    return {
      manifest,
      groups,
      installed,
      manifestError,
      busy,
      progress,
      failed,
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
      hasUpdate: (region) => !!update(region),
      updateWaitsForWifi: (region) => (update(region)?.bytes ?? 0) > AUTO_UPDATE_MAX_CELLULAR_BYTES,
    };
  }, [manifest, groups, installed, manifestError, busy, progress, failed, refresh, install, remove]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData poza DataProvider');
  return v;
}
