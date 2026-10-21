// Odjazdy ze stacji (przystanek = stacja: słupki po obu stronach ulicy i perony razem).
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { LodgingReturn } from '@/components/LodgingReturn';
import { OffSeasonCard } from '@/components/OffSeason';
import { ScreenHeader } from '@/components/ScreenHeader';
import { openAddPhoto, StopPhotos } from '@/components/StopPhotos';
import { LineBadge, Txt, useTextWidth } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { minutesTo, stationNames } from '@/data/nearby';
import { listInstalled, openRegion } from '@/data/packages';
import {
  lastDeparturesToday,
  resolveStation,
  stationById,
  stationDepartures,
  stationStops,
  type Departure,
  type RegionMeta,
  type Station,
} from '@/data/queries';
import { t, useLang } from '@/i18n';
import { distanceM } from '@/lib/geo';
import { isFavorite, setLodging, toggleFavorite, useSettings } from '@/lib/settings';
import { athensEpoch, athensNow, formatDate, type Now } from '@/lib/time';

const STEP = 3 * 3600;

export default function StopScreen() {
  useLang();
  const { region, station } = useLocalSearchParams<{ region: string; station: string }>();
  const [st, setSt] = useState<Station | null>(null);
  const [meta, setMeta] = useState<RegionMeta | null>(null);
  const [deps, setDeps] = useState<Departure[] | null>(null);
  const [last, setLast] = useState<Departure[]>([]);
  const [now, setNow] = useState<Now>(() => athensNow());
  const [span, setSpan] = useState(STEP);
  const [error, setError] = useState(false);
  const [approx, setApprox] = useState(false);
  /** Kody słupków z GTFS – zdjęcia przystanku są przypięte także do nich (numery stacji w paczkach się zmieniają). */
  const [codes, setCodes] = useState<string[]>([]);
  /** Po aktualizacji rozkładu tego przystanku już nie ma. */
  const [gone, setGone] = useState(false);
  const { favorites, lodging } = useSettings();
  const data = useData();
  const version = data.installed[region]?.version ?? '';
  /** Wersja paczki, z której jest numer stacji w adresie ekranu. */
  const shownVersion = useRef(version);

  const load = useCallback(async () => {
    // Nowa paczka już w telefonie, a numer jeszcze stary – czekamy, aż efekt niżej znajdzie ten sam przystanek.
    if (gone || listInstalled()[region]?.version !== shownVersion.current) return;
    try {
      const { db, cal, meta: m } = await openRegion(region);
      const id = Number(station);
      const n = athensNow();
      setNow(n);
      setMeta(m);
      const [row, posts] = await Promise.all([stationById(db, id), stationStops(db, id)]);
      // Kody przed przystankiem – gwiazdka (widoczna, gdy jest przystanek) zapisuje ulubiony razem z kodami.
      setApprox(posts.some((x) => x.verify));
      setCodes(posts.map((x) => x.code).filter(Boolean));
      setSt(row);
      const list = await stationDepartures(db, cal, id, n, n.sec - 60, n.sec + span);
      setDeps(list.filter((d) => d.dep >= n.sec - 30));
      setLast((await lastDeparturesToday(db, cal, id, n)).filter((d) => d.dep >= n.sec - 30));
      setError(false);
    } catch {
      setError(true);
    }
  }, [region, station, span, gone]);

  useFocusEffect(
    useCallback(() => {
      load();
      const tmr = setInterval(load, 30_000);
      return () => clearInterval(tmr);
    }, [load]),
  );

  // Nowa wersja rozkładu w trakcie oglądania (np. pobrana sama po powrocie do aplikacji): numer stacji mógł się zmienić,
  // więc ten sam przystanek szukamy po kodach słupków – inaczej ekran pokazałby odjazdy innego przystanku.
  useEffect(() => {
    if (!version || shownVersion.current === version) return;
    const accept = () => {
      shownVersion.current = version;
    };
    const ref = st ? { codes, name: st.name, name_en: st.name_en, lat: st.lat, lon: st.lon } : null;
    openRegion(region)
      // Przystanek jeszcze się nie wczytał – nie ma czego szukać, zwykłe wczytanie (undefined).
      .then(({ db }) => (ref ? resolveStation(db, ref) : undefined))
      .then((found) => {
        accept();
        if (found === null) setGone(true);
        else if (found && found.id !== Number(station)) router.setParams({ station: String(found.id) });
        else load();
      })
      .catch(accept);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tylko przy zmianie wersji paczki; przystanek z ostatniego wczytania
  }, [version]);

  const names = st ? stationNames(st) : null;
  const expired = meta && meta.validTo > 0 && meta.validTo < now.date;
  const fav = isFavorite(favorites, region, Number(station), version);
  const openFix = () => router.push({ pathname: '/popraw/[region]/[station]', params: { region, station: String(station) } });
  const isLodgingStop = !!st && !!lodging && lodging.region === region && distanceM(st.lat, st.lon, lodging.lat, lodging.lon) < 150;
  const timeW = useTextWidth(64);
  const lastW = useTextWidth(56);

  const star = st && version && !gone ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={fav ? t('favRemove') : t('favAdd')}
      accessibilityState={{ selected: fav }}
      onPress={() => toggleFavorite({ region, station: st.id, version, codes, name: st.name, name_en: st.name_en, lat: st.lat, lon: st.lon })}
      style={s.star}>
      <Icon name="star" size={24} color={fav ? C.orange : C.ink} fill={fav ? C.yellow : 'none'} stroke={2.2} />
    </Pressable>
  ) : null;

  return (
    <View style={s.screen}>
      <ScreenHeader region={region} kicker={t('departuresTitle')} title={names?.main ?? '…'} sub={names?.sub} right={star} />
      {gone ? (
        <View style={s.body}>
          <Txt w="bold" color={C.text2}>
            {t('stopGone')}
          </Txt>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          {/* Zdjęcie i położenie tuż pod nazwą – na dole, pod długą listą odjazdów, trudno je było zauważyć (decyzja Michała 21.10.2026). */}
          {st ? (
            <View style={s.actions}>
              {/* Poza sezonem karta niżej prosi już o zdjęcie (rozkładu na przystanku) – bez drugiej prośby. */}
              {!expired ? (
                <Pressable accessibilityRole="button" onPress={() => openAddPhoto(region, st.id)} style={s.action}>
                  <Icon name="camera" size={20} color={C.blue} stroke={2.2} />
                  <Txt w="bold" size={13} color={C.ink} numberOfLines={2} style={s.actionText}>
                    {t('photoAdd')}
                  </Txt>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityHint={approx ? t('fixApproxBody') : undefined}
                onPress={openFix}
                style={[s.action, approx && s.actionWarn]}>
                <Icon name="pin" size={20} color={approx ? C.orange : C.blue} stroke={2.2} />
                <Txt w="bold" size={13} color={approx ? C.orangeText : C.ink} numberOfLines={2} style={s.actionText}>
                  {approx ? t('fixApproxTitle') : t('fixButton')}
                </Txt>
              </Pressable>
            </View>
          ) : null}
          {meta && !expired ? (
            <Txt w="bold" size={13} color={C.muted} style={{ paddingHorizontal: 8 }}>
              {t('timetableValid', { date: formatDate(meta.validTo) })}
            </Txt>
          ) : null}
          {/* Rozkład wygasł, nowego jeszcze nie ma – „Poza sezonem” zamiast pustej listy odjazdów. */}
          {meta && expired ? <OffSeasonCard region={region} station={Number(station)} validFrom={meta.validFrom} validTo={meta.validTo} /> : null}

          {/* Zdjęcia przystanku od użytkowników – pomagają go znaleźć (decyzja Michała 05.10.2026). */}
          <StopPhotos region={region} station={Number(station)} stopCodes={codes} />

          {st && !expired ? (
            <LodgingReturn
              region={region}
              from={{ lat: st.lat, lon: st.lon }}
              fromStation={st.id}
              fromPlace={{ kind: 'station', region, id: st.id, name: st.name, name_en: st.name_en, lat: st.lat, lon: st.lon }}
            />
          ) : null}

          {!deps && !error ? <ActivityIndicator color={C.blue} style={{ marginTop: 24 }} /> : null}
          {error ? <Txt color={C.orangeText}>{t('errorGeneric')}</Txt> : null}
          {deps && deps.length === 0 && !expired ? <Txt color={C.muted}>{t('noDeparturesSoon')}</Txt> : null}

          {deps?.map((d) => {
            const min = minutesTo(d.dep, now.sec);
            return (
              <Pressable
                key={`${d.dayOffset}:${d.tripId}`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/trip/[region]/[trip]',
                    params: { region, trip: String(d.tripId), from: String(station), dep: String(athensEpoch(now, d.dep)) },
                  })
                }
                style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
                <View style={[s.timeCol, { width: timeW }]}>
                  <Txt w="black" size={20} color={C.ink}>
                    {d.time}
                  </Txt>
                  <Txt w="extrabold" size={12} color={C.blue}>
                    {min <= 0 ? t('now') : min < 120 ? t('inMin', { min }) : ' '}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.badgeRow}>
                    <LineBadge label={d.shortName} color={d.color} agencyCode={d.agencyCode} mode={d.mode} />
                    <Txt w="extrabold" size={15} numberOfLines={1} style={{ flex: 1 }}>
                      {d.headsign}
                    </Txt>
                  </View>
                  <Txt w="bold" size={12} color={C.muted} numberOfLines={1}>
                    {[d.est ? t('approx', { time: d.time }) : null, d.agency].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
              </Pressable>
            );
          })}

          {deps && deps.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setSpan((x) => x + STEP)} style={s.more}>
              <Txt w="extrabold" color={C.blue}>
                {t('showMore')}
              </Txt>
            </Pressable>
          ) : null}

          {last.length > 0 ? (
            <View style={s.lastCard}>
              <View style={s.lastIcon}>
                <Icon name="moon" size={24} color="#FFFFFF" stroke={2.2} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt w="extrabold" size={14} color={C.orangeText}>
                  {t('lastToday')}
                </Txt>
                {last.slice(-4).map((d) => (
                  <View key={d.headsign} style={s.badgeRow}>
                    <Txt w="black" size={18} color={C.orangeDeep} style={{ minWidth: lastW }}>
                      {d.time}
                    </Txt>
                    <Txt w="bold" size={14} color={C.orangeDeep} numberOfLines={1} style={{ flex: 1 }}>
                      {d.headsign}
                    </Txt>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {st && isLodgingStop ? (
            <View style={s.fixLink}>
              <Icon name="home" size={16} color={C.green} />
              <Txt w="bold" size={13} color={C.green}>
                {t('lodgingIsHere')}
              </Txt>
            </View>
          ) : st && !lodging ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setLodging({ region, lat: st.lat, lon: st.lon, near: { name: st.name, name_en: st.name_en } })}
              style={s.fixLink}
              hitSlop={6}>
              <Icon name="home" size={16} color={C.blue} />
              <Txt w="bold" size={13} color={C.blue}>
                {t('lodgingSetStop')}
              </Txt>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  timeCol: { width: 64 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  more: { alignItems: 'center', paddingVertical: 12 },
  lastCard: { flexDirection: 'row', gap: 14, backgroundColor: C.orangeBg, borderColor: C.orangeLine, borderWidth: 1.5, borderRadius: 18, padding: 14, marginTop: 4 },
  lastIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, backgroundColor: C.sky, borderColor: C.sky, borderWidth: 1.5, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12 },
  actionWarn: { backgroundColor: C.orangeBg, borderColor: C.orangeLine },
  actionText: { flex: 1, lineHeight: 17 },
  fixLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  star: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...shadow },
});
