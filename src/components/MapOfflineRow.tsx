// Wiersz „Mapa offline” regionu (Profil): pobieranie z postępem, gotowa mapa, ponowienie po błędzie, usuwanie.
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { C } from '@/constants/theme';
import { deleteMap, downloadMap, estimateMapBytes, MAPS_SUPPORTED, useMapPacks } from '@/data/offlineMaps';
import { t } from '@/i18n';

import { Icon } from './Icon';
import { fileSize } from './RegionList';
import { Txt } from './ui';

export function MapOfflineRow({ region, bbox }: { region: string; bbox: number[] | undefined }) {
  const packs = useMapPacks();
  if (!MAPS_SUPPORTED || !bbox) return null;
  const info = packs[region];

  const text = !info
    ? t('mapOfflineGet', { size: fileSize(estimateMapBytes(bbox)) })
    : info.state === 'downloading'
      ? t('mapDownloading', { pct: info.percent, size: fileSize(info.bytes) })
      : info.state === 'ready'
        ? t('mapReady', { size: fileSize(info.bytes) })
        : t('mapError');

  return (
    <View style={s.row}>
      <Icon name="map" size={20} color={info?.state === 'error' ? C.orange : C.blue} />
      <View style={{ flex: 1, gap: 4 }}>
        <Txt w="bold" size={14} color={info?.state === 'error' ? C.orangeText : C.text2}>
          {text}
        </Txt>
        {info?.state === 'downloading' ? (
          <View style={s.bar}>
            <View style={[s.barFill, { width: `${Math.max(3, info.percent)}%` }]} />
          </View>
        ) : null}
      </View>
      {info?.state === 'downloading' ? (
        <ActivityIndicator color={C.blue} />
      ) : info?.state === 'ready' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('mapRemove')} hitSlop={8} onPress={() => deleteMap(region)} style={s.btn}>
          <Icon name="trash" size={18} color={C.muted} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mapDownload')}
          hitSlop={8}
          onPress={() => downloadMap(region, bbox)}
          style={[s.btn, s.btnOutline]}>
          <Icon name={info ? 'refresh' : 'download'} size={18} color={C.blue} stroke={2.4} />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingLeft: 28, paddingRight: 16, paddingBottom: 10 },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.sky, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: C.blue },
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  btnOutline: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: C.blue },
});
