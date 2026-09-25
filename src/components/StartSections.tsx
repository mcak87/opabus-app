// Sekcje ekranu Start: ulubione przystanki, popularne przystanki regionu, karta „włącz lokalizację”.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { loadFavoriteDepartures, loadPopular, stationNames } from '@/data/nearby';
import type { Departure, Station } from '@/data/queries';
import { t } from '@/i18n';
import { useSettings } from '@/lib/settings';
import { athensNow } from '@/lib/time';

import { Icon, type IconName } from './Icon';
import { SectionTitle, StationCard } from './StationCard';
import { Button, Txt } from './ui';

/** Ulubione przystanki z 2 najbliższymi odjazdami (odświeżane co 30 s, gdy ekran jest widoczny). */
export function FavoritesSection({ tick }: { tick: number }) {
  const { favorites } = useSettings();
  const data = useData();
  const list = useMemo(() => favorites.filter((f) => data.installed[f.region]), [favorites, data.installed]);
  const [deps, setDeps] = useState<Record<string, Departure[]>>({});
  const [nowSec, setNowSec] = useState(() => athensNow().sec);

  useFocusEffect(
    useCallback(() => {
      if (list.length === 0) return;
      let alive = true;
      const run = () => {
        const n = athensNow();
        loadFavoriteDepartures(list, n).then((r) => {
          if (!alive) return;
          setNowSec(n.sec);
          setDeps(r);
        });
      };
      run();
      const id = setInterval(run, 30_000);
      return () => {
        alive = false;
        clearInterval(id);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` celowo wymusza ponowne wczytanie (pociągnij, aby odświeżyć)
    }, [list, tick]),
  );

  if (list.length === 0) return null;
  return (
    <>
      <SectionTitle text={t('favorites')} />
      {list.map((f) => {
        const key = `${f.region}:${f.station}`;
        const n = stationNames(f);
        return (
          <StationCard
            key={key}
            region={f.region}
            station={f.station}
            title={n.main}
            sub={[n.sub, data.regionName(f.region)].filter(Boolean).join(' · ')}
            icon="star"
            iconBg={C.orange}
            departures={deps[key] ?? null}
            nowSec={nowSec}
            emptyText={t('noDeparturesLater')}
          />
        );
      })}
    </>
  );
}

const isAirport = (st: Station) => /airport|lotnisk|αεροδρ|αερολιμ/i.test(`${st.name} ${st.name_en}`);

/** Najważniejsze przystanki regionu (najwięcej linii, różne miejscowości) – start bez lokalizacji. */
export function PopularSection({ region }: { region: string }) {
  const data = useData();
  const [list, setList] = useState<{ region: string; items: Station[] } | null>(null);

  useEffect(() => {
    let alive = true;
    loadPopular(region)
      .then((items) => alive && setList({ region, items }))
      .catch(() => alive && setList({ region, items: [] }));
    return () => {
      alive = false;
    };
  }, [region]);

  const items = list?.region === region ? list.items : [];
  if (items.length === 0) return null;
  return (
    <>
      <Txt w="black" size={12} color={C.muted} style={s.kicker}>
        {t('popularIn', { name: data.regionName(region) }).toUpperCase()}
      </Txt>
      <View style={s.listCard}>
        {items.map((st, i) => {
          const n = stationNames(st);
          const icon: IconName = isAirport(st) ? 'plane' : 'pin';
          return (
            <Pressable
              key={st.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/stop/[region]/[station]', params: { region, station: String(st.id) } })}
              style={({ pressed }) => [s.listRow, i > 0 && s.listLine, pressed && { backgroundColor: C.sky }]}>
              <View style={s.listIcon}>
                <Icon name={icon} size={18} color={C.blue} stroke={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt w="extrabold" size={16} color={C.ink} numberOfLines={1}>
                  {n.main}
                </Txt>
                {n.sub ? (
                  <Txt w="bold" size={12} color={C.muted} numberOfLines={1}>
                    {n.sub}
                  </Txt>
                ) : null}
              </View>
              <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/** „Najbliższe przystanki – włącz lokalizację” (prośba o zgodę albo przejście do ustawień telefonu). */
export function EnableLocationCard({ canAsk, onPress }: { canAsk: boolean; onPress: () => void }) {
  return (
    <View style={s.locCard}>
      <Icon name="locate" size={28} color={C.blue} />
      <View style={{ flex: 1 }}>
        <Txt w="black" size={15} color={C.ink}>
          {t('nearbyTitle')}
        </Txt>
        <Txt w="bold" size={13} color={C.text2} style={{ lineHeight: 18 }}>
          {canAsk ? t('locOffBody') : t('locOffSettings')}
        </Txt>
      </View>
      <Button title={canAsk ? t('turnOn') : t('settings')} onPress={onPress} style={s.locBtn} />
    </View>
  );
}

const s = StyleSheet.create({
  kicker: { paddingHorizontal: 8, marginTop: 6, letterSpacing: 0.8 },
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', ...shadow },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14 },
  listLine: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  listIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  locCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sky, borderRadius: 18, padding: 14, marginTop: 4 },
  locBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.blue },
});
