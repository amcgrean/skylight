import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, View } from 'react-native';

import { fmt } from '../lib/day';
import { Palette } from '../theme/theme';
import { T } from './ui';

/**
 * A labelled date or time row. iOS shows the native compact picker inline;
 * Android opens the system dialog when the value is tapped.
 */
export function DateField({ label, mode, value, onChange }: {
  label: string;
  mode: 'date' | 'time';
  value: Date;
  onChange: (date: Date) => void;
}) {
  const text = mode === 'date' ? fmt.headerDate(value) : `${fmt.clock(value)} ${fmt.ampm(value)}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
      <T size={15} weight="bold" style={{ flex: 1 }}>{label}</T>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          accentColor={Palette.mintDeep}
          onValueChange={(_, date) => onChange(date)}
        />
      ) : (
        <Pressable
          onPress={() =>
            DateTimePickerAndroid.open({ value, mode, onValueChange: (_: unknown, date: Date) => onChange(date) })
          }
          style={{ paddingHorizontal: 12, minHeight: 38, justifyContent: 'center', borderRadius: 10, backgroundColor: Palette.sand }}
        >
          <T size={15} weight="bold">{text}</T>
        </Pressable>
      )}
    </View>
  );
}
