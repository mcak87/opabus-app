// Okno „Opa! Nowa odznaka” (projekt: makieta programu nagród, ekran „Nowa odznaka”) – pokazuje się nad dowolnym
// ekranem, gdy w kolejce są nowo zdobyte stopnie odznak. W Etapie 1 bez punktów i XP (tylko odznaka i postęp).
import { router } from 'expo-router';
import { Modal, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { badgeDesc, badgeName, BadgeMedal, Pina, Rays, ROMAN } from '@/components/BadgeMedal';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/ui';
import { BADGES, nextGoal } from '@/data/badgeRules';
import { shiftPending, useBadges } from '@/data/badges';
import { t, upper } from '@/i18n';

const NAVY = '#0B2545';
const YELLOW = '#FFC93C';
const SOFT = '#D5DEEA';

export function BadgeCelebration({ enabled }: { enabled: boolean }) {
  const { pending, stats } = useBadges();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cur = enabled ? pending[0] : undefined;
  if (!cur) return null;

  const def = BADGES.find((b) => b.id === cur.id);
  if (!def) return null; // nieznane id odfiltrowuje już odczyt zapisu (badges.ts)
  const name = badgeName(cur.id);
  const goal = nextGoal(def, stats);
  const close = () => shiftPending();

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={[s.screen, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 28 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={close} hitSlop={8} style={[s.close, { top: insets.top + 12 }]}>
          <Icon name="x" size={22} color="#FFFFFF" stroke={2.4} />
        </Pressable>

        <Txt w="black" size={14} color={YELLOW} style={s.kicker}>
          {upper(t('badgeNewKicker'))}
        </Txt>

        <View style={s.medal}>
          {/* Promienie na całą szerokość ekranu, ze środkiem (195,250 w 390×460) w środku medalu. */}
          <View pointerEvents="none" style={{ position: 'absolute', left: 100 - (195 * width) / 390, top: 100 - (250 * width) / 390 }}>
            <Rays width={width} />
          </View>
          <BadgeMedal id={cur.id} tier={cur.tier} size={200} />
          <View style={s.pina}>
            <Pina width={70} />
          </View>
        </View>

        <View style={s.texts}>
          <Txt w="black" size={30} color="#FFFFFF" style={s.center}>
            {name}
          </Txt>
          <Txt w="extrabold" size={15} color={YELLOW} style={s.center}>
            {def.tiers.length > 1 ? t('badgeTier', { tier: ROMAN[cur.tier - 1] }) : t('badgeOnce')}
          </Txt>
          <Txt w="semibold" size={16} color={SOFT} style={[s.center, { lineHeight: 23 }]}>
            {badgeDesc(cur.id)}
          </Txt>
          {goal ? (
            <Txt w="bold" size={14} color={SOFT} style={[s.center, { marginTop: 6 }]}>
              {t('badgeProgress', { tier: ROMAN[goal.tier - 1], have: goal.have, need: goal.need })}
            </Txt>
          ) : null}
        </View>

        <View style={{ flex: 1 }} />
        <View style={s.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              close();
              router.push('/odznaki');
            }}
            style={[s.btn, { backgroundColor: YELLOW }]}>
            <Txt w="black" size={16} color={NAVY}>
              {t('badgeSeeAll')}
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => Share.share({ message: t('badgeShareText', { name }) }).catch(() => {})}
            style={[s.btn, s.outline]}>
            <Txt w="extrabold" size={16} color="#FFFFFF">
              {t('badgeShare')}
            </Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NAVY, alignItems: 'center', paddingHorizontal: 28, overflow: 'hidden' },
  close: { position: 'absolute', right: 16, zIndex: 3, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  kicker: { letterSpacing: 2, textAlign: 'center', zIndex: 2 },
  medal: { marginTop: 22, width: 200, height: 200 },
  pina: { position: 'absolute', right: -34, bottom: -16 },
  texts: { marginTop: 26, gap: 6, alignItems: 'center' },
  center: { textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: 10 },
  btn: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
});
