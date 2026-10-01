// Komunikaty z ustawień na stronie (data/appConfig): prośba o aktualizację i krótki komunikat na ekranie Start.
// Aktualizacja nigdy nie blokuje aplikacji – turysta bez internetu musi nadal widzieć rozkłady zapisane w telefonie.
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, shadow } from '@/constants/theme';
import { activeNotice, dismissNotice, needsUpdate, skipUpdate, storeUrl, useAppConfig } from '@/data/appConfig';
import { getLang, t, useLang } from '@/i18n';

import { Icon } from './Icon';
import { Logo } from './Logo';
import { Button, Txt } from './ui';

const openStore = (url: string) => Linking.openURL(url).catch(() => {});

/** Pełny ekran nad aplikacją przy starcie, gdy wersja jest starsza niż minVersion. „Nie teraz” – do następnego uruchomienia. */
export function UpdateOverlay() {
  useLang();
  const insets = useSafeAreaInsets();
  const cfg = useAppConfig();
  if (!needsUpdate(cfg.config) || cfg.updateSkipped) return null;
  return (
    <View style={[s.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} accessibilityViewIsModal>
      <View style={s.updateBody}>
        <Logo />
        <Txt w="black" size={26} color={C.ink} style={s.center}>
          {t('updateTitle')}
        </Txt>
        <Txt w="bold" size={16} color={C.text2} style={[s.center, { lineHeight: 23 }]}>
          {t('updateBody')}
        </Txt>
      </View>
      <View style={{ gap: 10 }}>
        <Button title={t('updateNow')} icon="download" onPress={() => openStore(storeUrl(cfg.config))} />
        <Button title={t('updateLater')} kind="text" onPress={skipUpdate} />
      </View>
    </View>
  );
}

/** Ekran Start: przypomnienie o aktualizacji (po „Nie teraz”) i komunikat ze strony. */
export function StartNotices() {
  useLang();
  const cfg = useAppConfig();
  const notice = activeNotice(cfg, getLang());
  const outdated = needsUpdate(cfg.config);
  if (!notice && !outdated) return null;
  return (
    <>
      {outdated ? (
        <Pressable accessibilityRole="button" onPress={() => openStore(storeUrl(cfg.config))} style={[s.card, s.updateCard]}>
          <Icon name="download" size={22} color={C.orangeText} />
          <Txt w="bold" size={14} color={C.orangeText} style={s.text}>
            {t('updateBanner')}
          </Txt>
        </Pressable>
      ) : null}
      {notice ? (
        <View style={[s.card, s.noticeCard]}>
          <Icon name="flag" size={22} color={C.blue} />
          <Pressable
            accessibilityRole={notice.url ? 'link' : 'text'}
            disabled={!notice.url}
            onPress={() => notice.url && Linking.openURL(notice.url).catch(() => {})}
            style={{ flex: 1, gap: 4 }}>
            <Txt w="bold" size={14} color={C.ink} style={s.text}>
              {notice.text}
            </Txt>
            {notice.url ? (
              <Txt w="extrabold" size={14} color={C.blue}>
                {t('noticeMore')}
              </Txt>
            ) : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={10} onPress={() => dismissNotice(notice.id)}>
            <Icon name="x" size={20} color={C.muted} stroke={2.4} />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: C.bg, paddingHorizontal: 24, justifyContent: 'space-between', zIndex: 10, elevation: 10 },
  updateBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  center: { textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, padding: 14 },
  updateCard: { backgroundColor: C.orangeBg, borderWidth: 1.5, borderColor: C.orangeLine, alignItems: 'center' },
  noticeCard: { backgroundColor: '#FFFFFF', ...shadow },
  text: { flex: 1, lineHeight: 20 },
});
