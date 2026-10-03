// Profil → Co nowego: aktualności ze strony opabus.com (nowe regiony, zmiany rozkładów, nowości w aplikacji).
// Lista jest w telefonie (bez internetu – ostatnio pobrana); pełny tekst otwiera się na stronie.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/ui';
import { C, shadow } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { markNewsSeen, refreshNews, seenNewsKeys, useNews } from '@/data/news';
import { arrow, t, useLang } from '@/i18n';
import { openSite, sitePage } from '@/lib/site';
import { formatDate } from '@/lib/time';

export default function NewsScreen() {
  useLang();
  const data = useData();
  const { items } = useNews();
  const [status, setStatus] = useState<'loading' | 'ok' | 'offline'>('loading');
  // „Nowe” liczymy względem stanu sprzed otwarcia ekranu – po wejściu licznik w Profilu znika.
  const [seenBefore] = useState(() => new Set(seenNewsKeys()));

  useEffect(() => {
    let alive = true;
    refreshNews()
      .then(() => alive && setStatus('ok'))
      .catch(() => alive && setStatus('offline'));
    return () => {
      alive = false;
    };
  }, []);

  const count = items.length;
  useEffect(() => {
    if (count) markNewsSeen();
  }, [count]);

  return (
    <View style={s.screen}>
      <ScreenHeader title={t('newsTitle')} />
      <ScrollView contentContainerStyle={s.body}>
        {items.length === 0 ? (
          status === 'loading' ? (
            <ActivityIndicator color={C.blue} size="large" style={{ marginTop: 32 }} />
          ) : (
            <View style={s.info}>
              <Icon name="news" size={22} color={C.blue} />
              <Txt w="bold" size={15} color={C.text2} style={{ flex: 1 }}>
                {status === 'offline' ? t('newsOffline') : t('newsEmpty')}
              </Txt>
            </View>
          )
        ) : null}

        {items.map((n) => (
          <Pressable key={n.key} accessibilityRole="link" onPress={() => openSite(n.url)} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
            <View style={s.meta}>
              {!seenBefore.has(n.key) ? (
                <View style={s.newChip}>
                  <Txt w="black" size={11} color={C.orangeText}>
                    {t('newBadge')}
                  </Txt>
                </View>
              ) : null}
              <Txt w="bold" size={13} color={C.muted}>
                {formatDate(Number(n.date.replace(/-/g, '')))}
              </Txt>
              {n.region ? (
                <Txt w="bold" size={13} color={C.muted}>
                  {`· ${data.regionName(n.region)}`}
                </Txt>
              ) : null}
            </View>
            <Txt w="black" size={17} color={C.ink} style={{ lineHeight: 23 }}>
              {n.title}
            </Txt>
            {n.summary ? (
              <Txt w="semibold" size={14} color={C.text2} style={{ lineHeight: 20 }}>
                {n.summary}
              </Txt>
            ) : null}
            <Txt w="extrabold" size={14} color={C.blue}>
              {`${t('newsRead')} ${arrow()}`}
            </Txt>
          </Pressable>
        ))}

        {items.length ? (
          <Pressable accessibilityRole="link" onPress={() => openSite(sitePage('news'))} hitSlop={8} style={s.all}>
            <Txt w="extrabold" size={14} color={C.blue}>
              {t('newsAll')}
            </Txt>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sky, borderRadius: 16, padding: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 6, ...shadow },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  newChip: { backgroundColor: C.orangeBg, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  all: { alignSelf: 'center', paddingVertical: 10 },
});
