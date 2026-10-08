// Odznaki (Etap 1 programu nagród): wszystkie odznaki z postępem i licznik własnego wkładu. Wszystko tylko w telefonie.
import { ScrollView, StyleSheet, View } from 'react-native';

import { badgeDesc, badgeName, BadgeMedal, ROMAN, TIER_RING } from '@/components/BadgeMedal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { BADGES, currentRun, nextGoal, tierOf } from '@/data/badgeRules';
import { useBadges } from '@/data/badges';
import { t, upper, useLang, type Key } from '@/i18n';

export default function BadgesScreen() {
  useLang();
  const { stats } = useBadges();
  const earned = BADGES.filter((b) => tierOf(b, stats) > 0).length;
  const counters: [Key, number][] = [
    ['badgesStatReports', stats.reports],
    ['badgesStatPhotos', stats.photos],
    ['badgesStatFixes', stats.fixes],
    ['badgesStatRegions', stats.regions.length],
    ['badgesStatStreak', currentRun(stats.days)],
  ];

  return (
    <View style={s.screen}>
      <ScreenHeader kicker={t('badgesSub')} title={t('badgesTitle')} sub={t('badgesProfileCount', { n: earned, m: BADGES.length })} />
      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.card, { padding: 14, gap: 10 }]}>
          <Txt w="black" size={13} color={C.muted} style={{ letterSpacing: 0.6 }}>
            {upper(t('badgesYourHelp'))}
          </Txt>
          <View style={s.stats}>
            {counters.map(([k, v]) => (
              <View key={k} style={s.stat}>
                <Txt w="black" size={22} color={C.ink}>
                  {v}
                </Txt>
                <Txt w="bold" size={12} color={C.muted} numberOfLines={1}>
                  {t(k)}
                </Txt>
              </View>
            ))}
          </View>
        </View>

        {BADGES.map((def) => {
          const tier = tierOf(def, stats);
          const goal = nextGoal(def, stats);
          const multi = def.tiers.length > 1;
          const status = tier === 0 ? t('badgeLocked') : multi ? t('badgeTier', { tier: ROMAN[tier - 1] }) : t('badgeOnce');
          const progress = goal ? Math.min(1, goal.have / goal.need) : 1;
          return (
            <View key={def.id} style={[s.card, s.row]}>
              <BadgeMedal id={def.id} tier={tier} size={64} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt w="extrabold" size={16} color={tier ? C.ink : C.text2}>
                  {badgeName(def.id)}
                </Txt>
                <Txt w="bold" size={13} color={tier ? (tier === 3 ? '#9A6B00' : C.blue) : C.muted}>
                  {status}
                </Txt>
                <Txt w="semibold" size={13} color={C.muted} style={{ lineHeight: 18 }}>
                  {badgeDesc(def.id)}
                </Txt>
                <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={[s.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: goal ? C.blue : TIER_RING[2] }]} />
                </View>
                {goal || multi ? (
                  <Txt w="bold" size={12} color={C.muted}>
                    {goal
                      ? multi
                        ? t('badgeProgress', { tier: ROMAN[goal.tier - 1], have: goal.have, need: goal.need })
                        : t('badgeProgressOnce', { have: goal.have, need: goal.need })
                      : t('badgeMax')}
                  </Txt>
                ) : null}
              </View>
            </View>
          );
        })}

        <Txt w="semibold" size={12} color={C.muted} style={{ textAlign: 'center', marginTop: 6, lineHeight: 17 }}>
          {t('badgesLocal')}
        </Txt>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, ...shadow },
  row: { flexDirection: 'row', gap: 14, padding: 14, alignItems: 'flex-start' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  stat: { width: '33.33%', gap: 1 },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.lineSoft, overflow: 'hidden', marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
});
