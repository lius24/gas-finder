import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from '@/lib/theme';
import { SECONDARY_OCTANES, type Octane, type OctaneSelection } from '@/lib/types';

const SHORT_LABELS: Record<Octane, string> = {
  86: 'h-alt',
  87: 'reg',
  89: 'mid',
  91: 'prem',
  93: 'prem+',
  94: 'ultra',
};

type Props = {
  value: OctaneSelection;
  onChange: (next: OctaneSelection) => void;
};

export function OctaneSelector({ value, onChange }: Props) {
  // The "premium" union shows by default; specific 91/93/94 chips are
  // revealed only after the user expands. If they explicitly picked a
  // secondary in a past session, keep the expanded chips visible.
  const isSpecificPremium = value === 91 || value === 93 || value === 94;
  const isSecondaryAlt = value === 86;
  const [userExpanded, setUserExpanded] = useState(false);
  const expanded = userExpanded || isSpecificPremium || isSecondaryAlt;

  const numericOptions: Octane[] = expanded
    ? [86, 87, 89, 91, 93, 94]
    : [87, 89];

  const collapseSecondaries = () => {
    Haptics.selectionAsync();
    if (isSpecificPremium) {
      // Drop back to the "any premium" superset rather than picking a
      // specific octane — that's the curated default.
      onChange('premium');
    } else if (isSecondaryAlt) {
      onChange(87);
    }
    setUserExpanded(false);
  };

  const premiumActive = value === 'premium';

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>OCTANE</Text>
        {expanded ? (
          <Pressable onPress={collapseSecondaries} hitSlop={10}>
            <Text style={styles.collapseLink}>× COLLAPSE</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.row}>
        {numericOptions.map((o) => {
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

        {/* PREMIUM mega-chip — the curated entry point for premium-octane
         *  drivers, merging 91/93/94 (Sunoco Ultra) into one ranked list. */}
        <Pressable
          onPress={() => {
            if (!premiumActive) Haptics.selectionAsync();
            onChange('premium');
          }}
          style={[styles.premiumCell, premiumActive && styles.premiumCellActive]}>
          <Text
            style={[
              styles.premiumNumber,
              premiumActive && styles.premiumNumberActive,
            ]}>
            91+
          </Text>
          <Text
            style={[
              styles.premiumLabel,
              premiumActive && styles.premiumLabelActive,
            ]}>
            any prem
          </Text>
        </Pressable>

        {!expanded ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setUserExpanded(true);
            }}
            style={styles.moreCell}
            accessibilityLabel="Show all octanes">
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

  premiumCell: {
    flex: 1.6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rust,
    backgroundColor: colors.paper,
    alignItems: 'center',
  },
  premiumCellActive: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  premiumNumber: {
    fontFamily: fonts.priceHeavy,
    fontSize: 16,
    color: colors.rust,
    letterSpacing: 0.3,
  },
  premiumNumberActive: { color: colors.amber },
  premiumLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    color: colors.rust,
    letterSpacing: 1.4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  premiumLabelActive: { color: colors.paper },

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
