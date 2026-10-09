// „Poza sezonem” (projekt: canvas „PozaSezonem”) – rozkład regionu wygasł, a nowego jeszcze nie ma. Zamiast pustej listy:
// wyjaśnienie, ostatni znany rozkład (wyraźnie oznaczony jako możliwie nieaktualny), telefon przewoźnika z paczki
// i prośba o zdjęcie rozkładu wiszącego na przystanku. Bez „Powiadom mnie” – aplikacja nie sprawdza rozkładów w tle.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { LineBadge, Txt, useTextWidth } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { openRegion } from '@/data/packages';
import { stationAgencies, stationDepartures, type Agency, type Departure } from '@/data/queries';
import { t, type Key } from '@/i18n';
import { athensNow, formatDate, lastKnownDay, type Now } from '@/lib/time';

export function OffSeasonCard({ region, station, validFrom, validTo }: { region: string; station: number; validFrom: number; validTo: number }) {
  const oldW = useTextWidth(56);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [old, setOld] = useState<{ day: Now; deps: Departure[] } | null>(null);
  const [showOld, setShowOld] = useState(false);

  useEffect(() => {
    let alive = true;
    openRegion(region)
      .then(({ db }) => stationAgencies(db, station))
      .then((a) => alive && setAgencies(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [region, station]);

  const toggleOld = async () => {
    if (!old) {
      try {
        const { db, cal } = await openRegion(region);
        const day = lastKnownDay(validTo, validFrom, athensNow());
        setOld({ day, deps: await stationDepartures(db, cal, station, day, 0, 86399) });
      } catch {
        return;
      }
    }
    setShowOld((x) => !x);
  };

  const contacts = agencies.filter((a) => a.phone || a.url).slice(0, 2);

  return (
    <View style={{ gap: 10 }}>
      <View style={[s.card, s.main]}>
        <View style={s.icon}>
          <Icon name="calendarClock" size={36} color="#B35C00" stroke={1.8} />
        </View>
        <Txt w="black" size={22} color={C.ink} style={s.center}>
          {t('offSeasonTitle')}
        </Txt>
        <Txt w="bold" size={15} color={C.text2} style={[s.center, { lineHeight: 21 }]}>
          {t('offSeasonBody', { date: formatDate(validTo) })}
        </Txt>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showOld }} onPress={toggleOld} style={s.outline}>
          <Txt w="extrabold" size={15} color={C.blue}>
            {showOld ? t('offSeasonHideOld') : t('offSeasonShowOld')}
          </Txt>
        </Pressable>
      </View>

      {showOld && old ? (
        <View style={[s.card, { padding: 14, gap: 8 }]}>
          <Txt w="extrabold" size={13} color={C.orangeText} style={{ lineHeight: 18 }}>
            {t('offSeasonOldHeader', { day: t(`wd${old.day.weekday}` as Key), date: formatDate(old.day.date) })}
          </Txt>
          {old.deps.length === 0 ? (
            <Txt w="bold" size={14} color={C.muted}>
              {t('offSeasonOldNone')}
            </Txt>
          ) : (
            old.deps.map((d) => (
              <View key={`${d.dayOffset}:${d.tripId}`} style={s.oldRow}>
                <Txt w="black" size={17} color={C.muted} style={{ width: oldW }}>
                  {d.time}
                </Txt>
                <LineBadge label={d.shortName} color="#9AA5BC" agencyCode={d.agencyCode} mode={d.mode} small />
                <Txt w="bold" size={14} color={C.muted} numberOfLines={1} style={{ flex: 1 }}>
                  {d.headsign}
                </Txt>
              </View>
            ))
          )}
        </View>
      ) : null}

      {contacts.map((a) => (
        <Pressable
          key={a.name}
          accessibilityRole={a.phone ? 'button' : 'link'}
          onPress={() => Linking.openURL(a.phone ? `tel:${a.phone.replace(/[^\d+]/g, '')}` : a.url).catch(() => {})}
          style={[s.card, s.row]}>
          <View style={s.rowIcon}>
            <Icon name={a.phone ? 'phone' : 'globe'} size={20} color={C.blue} stroke={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt w="extrabold" size={15} color={C.ink}>
              {a.phone ? t('offSeasonAsk') : t('offSeasonAskWeb')}
            </Txt>
            <Txt w="bold" size={13} color={C.muted} numberOfLines={1}>
              {[a.name, a.phone].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
        </Pressable>
      ))}

      <View style={s.photo}>
        <View style={s.photoIcon}>
          <Icon name="camera" size={22} color={C.green} stroke={2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt w="black" size={15} color="#0E4A32">
            {t('offSeasonPhotoTitle')}
          </Txt>
          <Txt w="bold" size={13} color="#1E5A40" style={{ lineHeight: 18 }}>
            {t('offSeasonPhotoBody')}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/zdjecie/[region]/[station]', params: { region, station: String(station), caption: t('offSeasonPhotoCaption') } })
          }
          style={s.photoBtn}>
          <Txt w="extrabold" size={14} color="#FFFFFF">
            {t('offSeasonPhotoSend')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, ...shadow },
  main: { alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20 },
  icon: { width: 72, height: 72, borderRadius: 24, backgroundColor: C.orangeBg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  outline: { marginTop: 8, alignSelf: 'stretch', height: 48, borderRadius: 16, borderWidth: 2, borderColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  oldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  photo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.greenBg, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  photoIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  photoBtn: { height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});
