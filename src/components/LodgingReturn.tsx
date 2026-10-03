// „Ostatni powrót do noclegu” (projekt: canvas „Odjazdy” – pomarańczowa karta): najpóźniejszy autobus, który dziś
// jeszcze dowiezie z tego miejsca do noclegu, także z innego przystanku w zasięgu spaceru. Dotknięcie = pełna trasa w planerze.
// Bez noclegu – zachęta do ustawienia (można ją schować).
import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { C, shadow } from '@/constants/theme';
import { lodgingPlace } from '@/data/lodging';
import { modeOf } from '@/data/queries';
import { t, useLang } from '@/i18n';
import { distanceM, walkMinutes, type LatLon } from '@/lib/geo';
import { cancelReminder, getReminder, setReminder } from '@/lib/reminders';
import { useSettings } from '@/lib/settings';
import { athensEpoch, athensNow, hhmm } from '@/lib/time';
import { patternLabel } from '@/planner/format';
import type { Journey, Net, RideLeg } from '@/planner/raptor';
import { lastReturn } from '@/planner/service';
import { setFrom, setTo, setWhen, type Place } from '@/planner/store';

import { Icon } from './Icon';
import { stopName } from './TripOption';
import { Button, LineBadge, Txt } from './ui';

/** Bliżej noclegu niż tyle – karty nie pokazujemy (to już „pod domem”). */
const NEAR_HOME_M = 800;
/** Do tylu metrów podpowiadamy też powrót pieszo. */
const WALK_HINT_M = 2000;
const K_PROMPT_HIDDEN = 'lodging.promptHidden.v1';
/** Przeliczamy co 5 minut albo po zmianie miejsca o ok. 100 m. */
const SLOT_MS = 5 * 60_000;

/** Przypomnienie o ostatnim autobusie – tyle przed odjazdem (canvas „Profil”: 30 min). */
const LAST_BUS_BEFORE = 30 * 60;

/**
 * Przypomnienie „Za 30 min ostatni autobus do noclegu” na podstawie powrotu policzonego z obecnego miejsca.
 * Ustawiane przy każdym otwarciu ekranu Start (bez śledzenia w tle), anulowane, gdy dziś już nic nie jedzie albo jesteśmy pod domem.
 */
async function syncLastBusReminder(net: Net, j: Journey | null) {
  const ride = j?.legs.find((l): l is RideLeg => l.kind === 'ride');
  if (!j || !ride) return cancelReminder('lastBus');
  const at = athensEpoch(athensNow(), ride.dep - LAST_BUS_BEFORE);
  if (getReminder('lastBus')?.at === at) return;
  const walk = j.legs[0]?.kind === 'walk' && j.legs[0].sec >= 60 ? Math.round(j.legs[0].sec / 60) : 0;
  const body =
    t('remindLastBody', { time: hhmm(ride.dep), line: patternLabel(net, ride.pattern), stop: stopName(net, ride.board) }) +
    (walk ? t('remindWalkSuffix', { min: walk }) : '');
  const r = await setReminder('lastBus', at, { title: t('remindLastTitle', { min: LAST_BUS_BEFORE / 60 }), body, url: '/' });
  if (r !== 'ok') await cancelReminder('lastBus');
}

export function LodgingReturn({
  region,
  from,
  fromStation,
  fromPlace,
  remind,
}: {
  region: string;
  from: LatLon;
  fromStation?: number;
  fromPlace: Place;
  /** Ustawiaj przypomnienie o ostatnim autobusie (tylko na Start – z prawdziwej lokalizacji). */
  remind?: boolean;
}) {
  useLang();
  const { lodging, remindLastBus } = useSettings();
  const [res, setRes] = useState<{ key: string; net: Net; journey: Journey | null } | null>(null);
  const [slot, setSlot] = useState(() => Math.floor(Date.now() / SLOT_MS));

  useEffect(() => {
    const id = setInterval(() => setSlot(Math.floor(Date.now() / SLOT_MS)), 60_000);
    return () => clearInterval(id);
  }, []);

  const lat = Math.round(from.lat * 1000) / 1000;
  const lon = Math.round(from.lon * 1000) / 1000;
  const active = !!lodging && lodging.region === region && distanceM(from.lat, from.lon, lodging.lat, lodging.lon) > NEAR_HOME_M;
  const key = lodging ? `${region}:${lat}:${lon}:${lodging.lat}:${lodging.lon}:${slot}` : '';
  const scheduling = !!remind && remindLastBus;

  useEffect(() => {
    if (!active || !lodging) return;
    let alive = true;
    lastReturn([region], { lat, lon }, lodging)
      .then((r) => {
        if (!alive) return;
        setRes({ key, ...r });
        if (scheduling) syncLastBusReminder(r.net, r.journey).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, key, region, lat, lon, lodging, scheduling]);

  // Pod domem przypomnienie o powrocie nie jest potrzebne.
  const nearHome = !!lodging && lodging.region === region && !active;
  useEffect(() => {
    if (scheduling && nearHome) cancelReminder('lastBus').catch(() => {});
  }, [scheduling, nearHome]);

  if (!active || !lodging || !res) return null;

  const dist = distanceM(from.lat, from.lon, lodging.lat, lodging.lon);
  const walkHint = dist <= WALK_HINT_M ? t('returnWalk', { min: walkMinutes(dist) }) : null;
  /** Planer od ok. 20 min przed ostatnim powrotem (żeby był na liście), a gdy dziś nic – jutro. */
  const openPlanner = (leave: number | null) => {
    setFrom(fromPlace);
    setTo(lodgingPlace(lodging));
    if (leave === null) setWhen('tomorrow');
    else setWhen('later', Math.max(0, leave - 20 * 60));
    router.push('/planer/wyniki');
  };

  const j = res.journey;
  if (!j) {
    return (
      <Pressable accessibilityRole="button" onPress={() => openPlanner(null)} style={s.card}>
        <View style={s.icon}>
          <Icon name="moon" size={24} color="#FFFFFF" stroke={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt w="extrabold" size={14} color={C.orangeText}>
            {t('returnTitle')}
          </Txt>
          <Txt w="black" size={17} color={C.orangeDeep} style={{ lineHeight: 22 }}>
            {t('returnNone')}
          </Txt>
          {walkHint ? (
            <Txt w="bold" size={13} color={C.orangeDeep}>
              {walkHint}
            </Txt>
          ) : null}
          <Txt w="extrabold" size={13} color={C.blue}>
            {t('returnTomorrow')}
          </Txt>
        </View>
      </Pressable>
    );
  }

  const net = res.net;
  const ride = j.legs.find((l): l is RideLeg => l.kind === 'ride');
  if (!ride) return null;
  const route = net.routes.get(net.patterns[ride.pattern].route);
  const fromHere = fromStation !== undefined && net.stops[ride.board].region === region && net.stops[ride.board].stationId === fromStation;
  const firstWalk = j.legs[0]?.kind === 'walk' ? j.legs[0].sec : 0;
  const where = fromHere
    ? t('returnFromHere', { time: hhmm(j.arrive) })
    : firstWalk >= 60
      ? t('returnFromStop', { stop: stopName(net, ride.board), min: Math.max(1, Math.round(firstWalk / 60)), time: hhmm(j.arrive) })
      : t('lastBackFrom', { stop: stopName(net, ride.board), time: hhmm(j.arrive) });

  return (
    <Pressable accessibilityRole="button" accessibilityHint={t('returnSeeRoute')} onPress={() => openPlanner(j.leave)} style={s.card}>
      <View style={s.icon}>
        <Icon name="moon" size={24} color="#FFFFFF" stroke={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt w="extrabold" size={14} color={C.orangeText}>
          {t('returnTitle')}
        </Txt>
        <View style={s.row}>
          <Txt w="black" size={28} color={C.orangeDeep}>
            {ride.depEst ? t('approx', { time: hhmm(ride.dep) }) : hhmm(ride.dep)}
          </Txt>
          <LineBadge label={patternLabel(net, ride.pattern)} color={route?.color ?? null} agencyCode={route?.agencyCode ?? ''} mode={modeOf(route?.type ?? 3)} />
        </View>
        <Txt w="bold" size={13} color={C.orangeDeep} style={{ lineHeight: 18 }}>
          {[where, j.rides > 1 ? t('returnWithChange') : null].filter(Boolean).join(' · ')}
        </Txt>
        {walkHint ? (
          <Txt w="bold" size={13} color={C.orangeDeep}>
            {walkHint}
          </Txt>
        ) : null}
      </View>
      <Icon name="chevronR" size={18} color={C.orangeText} stroke={2.4} />
    </Pressable>
  );
}

/** Zachęta „Gdzie nocujesz?” na ekranie Start, gdy nocleg nie jest ustawiony. */
export function LodgingPrompt() {
  useLang();
  const { lodging } = useSettings();
  const [hidden, setHidden] = useState(() => Storage.getItemSync(K_PROMPT_HIDDEN) === '1');
  if (lodging || hidden) return null;
  const hide = () => {
    Storage.setItemSync(K_PROMPT_HIDDEN, '1');
    setHidden(true);
  };
  return (
    <View style={s.prompt}>
      <View style={s.promptTop}>
        <Icon name="home" size={22} color={C.blue} />
        <Txt w="extrabold" size={15} color={C.ink} style={{ flex: 1, lineHeight: 20 }}>
          {t('lodgingPrompt')}
        </Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={10} onPress={hide}>
          <Icon name="x" size={20} color={C.muted} stroke={2.4} />
        </Pressable>
      </View>
      <Button title={t('lodgingSetButton')} kind="outline" icon="home" onPress={() => router.push({ pathname: '/planer/szukaj', params: { field: 'lodging' } })} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.orangeBg, borderColor: C.orangeLine, borderWidth: 1.5, borderRadius: 18, padding: 14 },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prompt: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, gap: 12, ...shadow },
  promptTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
