import { StyleSheet, View } from 'react-native';

import { C } from '@/constants/theme';
import { minutesTo } from '@/data/nearby';
import type { Departure } from '@/data/queries';
import { t } from '@/i18n';

import { LineBadge, Txt } from './ui';

/** Wiersz odjazdu w karcie przystanku: plakietka linii, kierunek, godzina, „za X min”. */
export function DepartureRow({ d, nowSec }: { d: Departure; nowSec: number }) {
  const min = minutesTo(d.dep, nowSec);
  const rel = min <= 0 ? t('now') : min < 60 ? t('inMin', { min }) : null;
  return (
    <View style={s.row}>
      <LineBadge label={d.shortName} color={d.color} agencyCode={d.agencyCode} mode={d.mode} />
      <Txt w="bold" size={15} style={s.dest} numberOfLines={1}>
        {d.headsign}
      </Txt>
      <Txt w="bold" size={13} color={C.muted}>
        {d.est ? t('approx', { time: d.time }) : d.time}
      </Txt>
      {rel ? (
        <Txt w="black" size={15} color={C.blue} style={s.rel}>
          {rel}
        </Txt>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  dest: { flex: 1 },
  rel: { minWidth: 60, textAlign: 'right' },
});
