import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RADIUS_OPTIONS_METERS, type RadiusMeters } from '@/lib/preferences';
import { colors, fonts, space } from '@/lib/theme';

type Props = {
  value: RadiusMeters;
  onChange: (next: RadiusMeters) => void;
};

const LABELS: Record<RadiusMeters, string> = {
  1609: '1',
  4828: '3',
  8047: '5',
  16093: '10',
};

export function RadiusSelector({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>RADIUS · MILES</Text>
      <View style={styles.row}>
        <View style={styles.tickLine} />
        {RADIUS_OPTIONS_METERS.map((m) => {
          const active = m === value;
          return (
            <Pressable
              key={m}
              onPress={() => {
                if (!active) Haptics.selectionAsync();
                onChange(m);
              }}
              style={styles.tick}>
              <View style={[styles.dot, active && styles.dotActive]} />
              <Text style={[styles.label, active && styles.labelActive]}>{LABELS[m]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  heading: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 2,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 8,
  },
  tickLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 7,
    height: 1,
    backgroundColor: colors.dust,
  },
  tick: {
    alignItems: 'center',
    paddingHorizontal: 6,
    backgroundColor: colors.bg,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.dust,
  },
  dotActive: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  label: {
    fontFamily: fonts.numeral,
    fontSize: 12,
    color: colors.inkFaint,
    marginTop: 6,
  },
  labelActive: {
    color: colors.rust,
  },
});
