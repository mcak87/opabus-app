import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { C } from '@/constants/theme';

import { Txt } from './ui';

const BUS = `<svg viewBox="0 0 30 30"><rect x="4" y="3" width="22" height="21" rx="6" fill="#1E4FD8"/><rect x="7.5" y="6.5" width="15" height="8" rx="2.5" fill="#FFFFFF"/><path d="M10.3 11.6q1.6-2 3.2 0M16.5 11.6q1.6-2 3.2 0" fill="none" stroke="#1E4FD8" stroke-width="1.5" stroke-linecap="round"/><path d="M11 18.2q4 3 8 0" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><rect x="7" y="22.5" width="4.5" height="4.5" rx="1.5" fill="#1E4FD8"/><rect x="18.5" y="22.5" width="4.5" height="4.5" rx="1.5" fill="#1E4FD8"/></svg>`;
const SHOUT = `<svg viewBox="0 0 14 20"><path d="M4 3 3 10M10 6l-3 5" fill="none" stroke="#FFC928" stroke-width="3" stroke-linecap="round"/></svg>`;

export function Logo() {
  return (
    <View style={s.row} accessibilityLabel="OpaBus">
      <SvgXml xml={BUS} width={30} height={30} />
      <Txt w="black" size={26} color={C.blue} style={s.word}>
        OpaBus
      </Txt>
      <View style={s.shout}>
        <SvgXml xml={SHOUT} width={11} height={16} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  word: { letterSpacing: -0.5 },
  shout: { marginLeft: -4, marginTop: -16 },
});
