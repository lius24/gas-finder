import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from '@/lib/theme';
import { PRIMARY_OCTANES, SECONDARY_OCTANES, type Octane } from '@/lib/types';

const SHORT_LABELS: Record<Octane, string> = {
  86: 'h-alt',
  87: 'reg',
  89: 'mid',
  91: 'prem',
  93: 'prem+',
  94: 'ultra',
};

type Props = {
  value: Octane;
  onChange: (octane: Octane) => void;
};

export function OctaneSelector({ value, onChange }: Props) {
  // If the user is on a secondary octane (e.g. they had 86 picked from a
  // previous session), keep the secondary chips visible. Otherwise let them
  // toggle on demand.
  const [userExpanded, setUserExpanded] = useState(false);
  const expanded = userExpanded || SECONDARY_OCTANES.includes(value);

  const visibleOptions: Octane[] = expanded
    ? [86, 87, 89, 91, 93, 94]
    : PRIMARY_OCTANES;

  const collapseSecondaries = () => {
    Haptics.selectionAsync();
    if (SECONDARY_OCTANES.includes(value)) {
      // Currently sitting on 86 or 94 — fall back to standard regular before
      // hiding the secondary chips, otherwise the row would force itself
      // re-expanded on next render.
      onChange(87);
    }
    setUserExpanded(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>OCTANE</Text>
        {expanded ? (
          <Pressable onPress={collapseSecondaries} hitSlop={10}>
            <Text style={styles.collapseLink}>× HIDE 86 / 94</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.row}>
        {visibleOptions.map((o) => {
          const active = o === value;
          const isSecondary = SECONDARY_OCTANES.includes(o);
          return (
            <Pressable
              key={o}
              onPress={() => {
                if (!active) Haptics.selectionAsync();
                onChange(o);
              }}
              style={[
                styles.cell,
                active && styles.cellActive,
                isSecondary && !active && styles.cellSecondary,
              ]}>
              <Text
                style={[
                  styles.number,
                  active && styles.numberActive,
                  isSecondary && !active && styles.numberSecondary,
                ]}>
                {o}
              </Text>
              <Text style={[styles.label, active && styles.labelActive]}>
                {SHORT_LABELS[o]}
              </Text>
            </Pressable>
          );
        })}

        {!expanded ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setUserExpanded(true);
            }}
            style={styles.moreCell}
            accessibilityLabel="Show more octanes">
            <Text style={styles.moreDots}>···</Text>
            <Text style={styles.moreLabel}>more</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heading: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 2,
  },
  collapseLink: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.rust,
    letterSpacing: 1.5,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  cell: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dust,
    backgroundColor: colors.paper,
    alignItems: 'center',
  },
  cellActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  cellSecondary: {
    backgroundColor: colors.bg,
    borderStyle: 'dashed',
  },
  number: {
    fontFamily: fonts.priceHeavy,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: 0.3,
  },
  numberActive: { color: colors.amber },
  numberSecondary: { color: colors.inkSoft },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8,
    color: colors.inkFaint,
    letterSpacing: 1.2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  labelActive: { color: colors.paper },

  moreCell: {
    width: 44,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dust,
    borderStyle: 'dashed',
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreDots: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.rust,
    letterSpacing: 1,
    lineHeight: 18,
  },
  moreLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8,
    color: colors.rust,
    letterSpacing: 1.2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
