// Profil → Współpraca (projekt: canvas „Współpraca”): przewoźnicy, hotele (plakat z kodem QR), zgłoszenie zmiany w
// rozkładzie i kontakt. Karty otwierają strony opabus.com (formularz, generator plakatu) – bez formularzy w aplikacji.
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { t, useLang, type Key } from '@/i18n';
import { useSettings } from '@/lib/settings';
import { openSite, PARTNERS_EMAIL, sitePage } from '@/lib/site';

export default function PartnersScreen() {
  useLang();
  const data = useData();
  const { homeRegion } = useSettings();
  // Region w zgłoszeniu zmiany wpisuje się sam (można go zmienić w formularzu).
  const region = homeRegion && data.installed[homeRegion] ? data.regionName(homeRegion) : undefined;

  return (
    <View style={s.screen}>
      <ScreenHeader region={homeRegion ?? undefined} title={t('partnersTitle')} />
      <ScrollView contentContainerStyle={s.body}>
        <Txt w="bold" size={15} color={C.text2} style={s.intro}>
          {t('partnersIntro')}
        </Txt>

        <PartnerCard
          icon="bus"
          color={C.blue}
          kickerColor={C.blue}
          kicker="partnersCarrierKicker"
          title="partnersCarrierTitle"
          body="partnersCarrierBody"
          onPress={() => openSite(sitePage('partners', { typ: 'przewoznik' }, 'formularz'))}
        />
        <PartnerCard
          icon="qr"
          color={C.orange}
          kickerColor={C.orangeText}
          kicker="partnersHotelKicker"
          title="partnersHotelTitle"
          body="partnersHotelBody"
          onPress={() => openSite(sitePage('poster'))}
        />
        <PartnerCard
          icon="camera"
          color={C.green}
          kickerColor={C.green}
          kicker="partnersReportKicker"
          title="partnersReportTitle"
          body="partnersReportBody"
          onPress={() => openSite(sitePage('partners', { typ: 'zgloszenie', region }, 'formularz'))}
        />

        <View style={s.contact}>
          <Icon name="mail" size={26} color={C.blue} />
          <View style={{ flex: 1 }}>
            <Txt w="black" size={15} color={C.ink}>
              {t('partnersOther')}
            </Txt>
            <Txt w="bold" size={13} color={C.text2} selectable>
              {PARTNERS_EMAIL}
            </Txt>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('partnersWrite')}: ${PARTNERS_EMAIL}`}
            onPress={() => Linking.openURL(`mailto:${PARTNERS_EMAIL}?subject=OpaBus`).catch(() => {})}
            style={({ pressed }) => [s.write, pressed && { opacity: 0.85 }]}>
            <Txt w="extrabold" size={14} color="#FFFFFF">
              {t('partnersWrite')}
            </Txt>
          </Pressable>
        </View>

        <Txt w="semibold" size={12} color={C.muted} style={s.note}>
          {t('partnersWeb')}
        </Txt>
      </ScrollView>
    </View>
  );
}

function PartnerCard({
  icon,
  color,
  kickerColor,
  kicker,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  color: string;
  kickerColor: string;
  kicker: Key;
  title: Key;
  body: Key;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={[s.cardIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={24} color="#FFFFFF" stroke={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt w="black" size={12} color={kickerColor} style={s.kicker}>
          {t(kicker)}
        </Txt>
        <Txt w="black" size={16} color={C.ink}>
          {t(title)}
        </Txt>
        <Txt w="bold" size={13} color={C.muted} style={{ lineHeight: 18 }}>
          {t(body)}
        </Txt>
      </View>
      <Icon name="chevronR" size={18} color={C.faint} stroke={2.4} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  intro: { paddingHorizontal: 8, paddingBottom: 6, lineHeight: 21 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, ...shadow },
  cardIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  kicker: { textTransform: 'uppercase', letterSpacing: 0.6 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sky, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginTop: 6 },
  write: { height: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  note: { textAlign: 'center', marginTop: 4 },
});
