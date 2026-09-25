// Link z kodu QR: https://opabus.com/s/<region>/<przystanek>[,<przystanek2>]?h=<kod_partnera>
// Otwiera odjazdy z przystanku; w razie potrzeby najpierw pobiera paczkę regionu. Zdarzenie app_open → /api/hit.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { useData } from '@/data/DataContext';
import { DATA_URL, openRegion } from '@/data/packages';
import { stationIdForStopCode } from '@/data/queries';
import { t } from '@/i18n';

export default function QrLinkScreen() {
  const { region, stops, h } = useLocalSearchParams<{ region: string; stops: string; h?: string }>();
  const data = useData();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`${DATA_URL}/api/hit`, { method: 'POST', body: JSON.stringify({ e: 'app_open', h: h || '_' }) }).catch(() => {});
  }, [h]);

  const started = useRef(false);
  const isInstalled = !!data.installed[region];
  const hasManifest = !!data.manifest;
  const install = data.install;

  useEffect(() => {
    if (started.current || (!isInstalled && !hasManifest)) return; // bez paczki czekamy na manifest
    started.current = true;
    (async () => {
      try {
        if (!isInstalled) await install(region);
        const { db } = await openRegion(region);
        const code = decodeURIComponent(String(stops).split(',')[0]);
        const station = await stationIdForStopCode(db, code);
        if (station == null) throw new Error('brak przystanku');
        router.replace({ pathname: '/stop/[region]/[station]', params: { region, station: String(station) } });
      } catch {
        setFailed(true);
      }
    })();
  }, [region, stops, isInstalled, hasManifest, install]);

  return (
    <View style={s.screen}>
      {failed ? (
        <>
          <Txt w="bold" color={C.text2} style={{ textAlign: 'center' }}>
            {t('errorGeneric')}
          </Txt>
          <Button title={t('tabStart')} onPress={() => router.replace('/')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={C.blue} />
          <Txt color={C.muted}>{t('downloading')}</Txt>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: C.bg },
});
