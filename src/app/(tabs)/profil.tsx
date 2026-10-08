// Profil – mój nocleg, język, regiony offline (pobieranie, aktualizacja, usuwanie), źródła danych.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BadgeMedal } from '@/components/BadgeMedal';
import { Icon } from '@/components/Icon';
import { MapOfflineRow } from '@/components/MapOfflineRow';
import { RegionList } from '@/components/RegionList';
import { ExactAlarmHint } from '@/components/ReminderButton';
import { Button, PanoramaHeader, Pill, Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { BADGES, tierOf } from '@/data/badgeRules';
import { useBadges } from '@/data/badges';
import { OVERLAY_REGIONS, useData } from '@/data/DataContext';
import { lodgingStopName } from '@/data/lodging';
import { useNews } from '@/data/news';
import { hasTranslation, LANGS, rtlRestartNeeded, setLang, t, upper, useLang } from '@/i18n';
import { cancelReminder, ensurePermission } from '@/lib/reminders';
import { setLodging, setRemindLastBus, useSettings } from '@/lib/settings';
import { formatDate } from '@/lib/time';

export default function ProfileScreen() {
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const data = useData();
  const { lodging, remindLastBus } = useSettings();
  const news = useNews();
  const badges = useBadges();
  const earnedBadges = BADGES.filter((b) => tierOf(b, badges.stats) > 0);
  const [showLangs, setShowLangs] = useState(false);
  const [remindMsg, setRemindMsg] = useState(false);
  const openLodging = () => router.push({ pathname: '/planer/szukaj', params: { field: 'lodging' } });

  const toggleRemind = async (on: boolean) => {
    setRemindMsg(false);
    if (!on) {
      setRemindLastBus(false);
      cancelReminder('lastBus');
      return;
    }
    // Zgoda na powiadomienia od razu – samo przypomnienie ustawi się przy najbliższym otwarciu ekranu Start.
    if ((await ensurePermission()) === 'granted') setRemindLastBus(true);
    else setRemindMsg(true);
  };

  const installed = Object.values(data.installed).sort((a, b) => data.regionName(a.region).localeCompare(data.regionName(b.region)));

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
        {/* Mój nocleg (projekt: canvas „Profil”) – ostatni autobus powrotny na Start i przy każdym przystanku. */}
        <View style={[s.card, s.lodgingCard]}>
          <Pressable accessibilityRole="button" onPress={openLodging} style={s.lodgingMain}>
            <View style={s.lodgingIcon}>
              <Icon name="home" size={22} color="#FFFFFF" stroke={2.2} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Txt w="bold" size={13} color={C.muted}>
                {t('lodgingTitle')}
              </Txt>
              <Txt w="extrabold" size={17} color={C.ink} numberOfLines={1}>
                {lodging ? (lodgingStopName(lodging) ?? t('lodgingPoint')) : t('lodgingNotSet')}
              </Txt>
              <Txt w="semibold" size={13} color={C.muted} style={{ lineHeight: 18 }}>
                {lodging ? `${t('lodgingHint')} · ${data.regionName(lodging.region)}` : t('lodgingHintEmpty')}
              </Txt>
            </View>
            <Txt w="extrabold" size={15} color={C.blue}>
              {lodging ? t('lodgingChange') : t('lodgingSet')}
            </Txt>
          </Pressable>
          {lodging ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('lodgingRemove')}
              onPress={() => {
                setLodging(null);
                cancelReminder('lastBus');
              }}
              style={s.del}>
              <Icon name="trash" size={20} color={C.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Odznaki (Etap 1 programu nagród) – zdobyte w tym telefonie. */}
        <Pressable accessibilityRole="button" onPress={() => router.push('/odznaki')} style={[s.card, { padding: 14, gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Txt w="extrabold" size={16} color={C.ink}>
                {t('badgesTitle')}
              </Txt>
              <Txt w="semibold" size={13} color={C.muted}>
                {t('badgesProfileCount', { n: earnedBadges.length, m: BADGES.length })}
              </Txt>
            </View>
            <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
          </View>
          {earnedBadges.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {earnedBadges.map((b) => (
                <BadgeMedal key={b.id} id={b.id} tier={tierOf(b, badges.stats)} size={52} />
              ))}
            </View>
          ) : (
            <Txt w="semibold" size={13} color={C.text2} style={{ lineHeight: 18 }}>
              {t('badgesEmpty')}
            </Txt>
          )}
        </Pressable>

        {/* Przypomnienie o ostatnim autobusie do noclegu (projekt: canvas „Profil”). */}
        {lodging ? (
          <View style={s.card}>
            <View style={s.menuRow}>
              <Icon name="bell" size={22} color={C.blue} />
              <View style={{ flex: 1, paddingVertical: 10 }}>
                <Txt w="extrabold" size={16} color={C.ink}>
                  {t('remindLastSetting')}
                </Txt>
                <Txt w="semibold" size={13} color={C.muted}>
                  {t('remindLastSettingSub')}
                </Txt>
              </View>
              <Switch
                accessibilityLabel={t('remindLastSetting')}
                value={remindLastBus}
                onValueChange={toggleRemind}
                trackColor={{ true: C.blue, false: '#C4CCE0' }}
                thumbColor="#FFFFFF"
              />
            </View>
            {remindLastBus ? (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                <ExactAlarmHint />
              </View>
            ) : null}
            {remindMsg ? (
              <View style={s.remindMsg}>
                <Txt w="bold" size={13} color={C.orangeText} style={{ flex: 1, lineHeight: 18 }}>
                  {t('remindNoPermission')}
                </Txt>
                <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} hitSlop={8}>
                  <Txt w="extrabold" size={13} color={C.blue}>
                    {t('openSettings')}
                  </Txt>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

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
          {rtlRestartNeeded() ? (
            <View style={s.remindMsg}>
              <Txt w="bold" size={13} color={C.orangeText} style={{ flex: 1, lineHeight: 18 }}>
                {t('restartRtl')}
              </Txt>
            </View>
          ) : null}
        </View>

        {/* Co nowego i Współpraca (projekt: canvas „Profil”, „Współpraca”). */}
        <View style={s.card}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/nowosci')} style={s.menuRow}>
            <Icon name="news" size={22} color={C.blue} />
            <View style={{ flex: 1, paddingVertical: 10 }}>
              <Txt w="extrabold" size={16} color={C.ink}>
                {t('newsTitle')}
              </Txt>
              <Txt w="semibold" size={13} color={C.muted}>
                {t('newsSub')}
              </Txt>
            </View>
            {news.unseen > 0 ? (
              <View style={s.badge} accessibilityLabel={`${t('newBadge')}: ${news.unseen}`}>
                <Txt w="black" size={13} color="#FFFFFF">
                  {news.unseen}
                </Txt>
              </View>
            ) : null}
            <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/wspolpraca')} style={[s.menuRow, s.menuLine]}>
            <Icon name="people" size={22} color={C.orangeText} />
            <View style={{ flex: 1, paddingVertical: 10 }}>
              <Txt w="extrabold" size={16} color={C.ink}>
                {t('partnersTitle')}
              </Txt>
              <Txt w="semibold" size={13} color={C.muted}>
                {t('partnersSub')}
              </Txt>
            </View>
            <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
          </Pressable>
        </View>

        <Txt w="black" size={13} color={C.muted} style={s.section}>
          {upper(t('regionsOffline'))}
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
              {upper(t('inPhone'))}
            </Txt>
            {installed.map((i) => (
              <View key={i.region}>
                <View style={s.regionRow}>
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
                    <Pressable accessibilityRole="button" accessibilityLabel={`${t('update')} ${data.regionName(i.region)}`} onPress={() => data.install(i.region)} style={s.dl}>
                      <Icon name="refresh" size={20} color={C.blue} stroke={2.4} />
                    </Pressable>
                  ) : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`${t('remove')} ${data.regionName(i.region)}`} onPress={() => data.remove(i.region)} style={s.del}>
                    <Icon name="trash" size={20} color={C.muted} />
                  </Pressable>
                </View>
                {OVERLAY_REGIONS.has(i.region) ? null : (
                  <MapOfflineRow region={i.region} bbox={data.manifest?.packages.find((p) => p.region === i.region)?.bbox} />
                )}
              </View>
            ))}
          </View>
        ) : null}

        {data.manifest ? (
          <View style={s.card}>
            <Txt w="black" size={13} color={C.muted} style={s.cardLabel}>
              {upper(t('available'))}
            </Txt>
            <RegionList
              right={(p) =>
                data.busy[p.region] ? (
                  <ActivityIndicator color={C.blue} />
                ) : data.installed[p.region] ? (
                  <Icon name="check" size={22} color={C.green} stroke={2.6} />
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${t('download')} ${data.regionName(p.region)}`} onPress={() => data.install(p.region, { withMap: true })} style={s.dl}>
                    <Icon name="download" size={20} color={C.blue} stroke={2.4} />
                  </Pressable>
                )
              }
            />
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
  cardLabel: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, letterSpacing: 0.6 },
  section: { paddingHorizontal: 8, marginTop: 8, letterSpacing: 0.8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  menuLine: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  badge: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: C.orangeText, alignItems: 'center', justifyContent: 'center' },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.lineSoft },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
  dl: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  del: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  lodgingCard: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  remindMsg: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  lodgingMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 76 },
  lodgingIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
});
