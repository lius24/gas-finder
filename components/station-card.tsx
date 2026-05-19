import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatSavingsRange, type AnnotatedStation } from '@/lib/decision-math';
import { formatDistance, formatPriceCents } from '@/lib/geo';
import { staleLabel } from '@/lib/staleness';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';
import type { StationWithPrice } from '@/lib/types';

type Props = {
  station: StationWithPrice | AnnotatedStation;
  isCheapest?: boolean;
  isClosest?: boolean;
  favorited?: boolean;
};

function isAnnotated(s: StationWithPrice | AnnotatedStation): s is AnnotatedStation {
  return 'savings' in s;
}

export function StationCard({ station, isCheapest, isClosest, favorited }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const savings =
    isAnnotated(station) && station.savings ? formatSavingsRange(station.savings) : null;
  const positive =
    isAnnotated(station) && station.savings ? station.savings.centralDollars > 0 : false;
  return (
    <Link
      href={{
        pathname: '/station/[id]',
        params: { id: station.id, seed: JSON.stringify(station) },
      }}
      asChild>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          isCheapest && styles.cardCheapest,
          pressed && styles.cardPressed,
        ]}>
        {station.price_cents !== null && (isCheapest || isClosest) ? (
          <View style={styles.stampRow}>
            {isCheapest ? (
              <View style={[styles.stamp, styles.stampCheapest]}>
                <Text style={styles.stampText}>★ CHEAPEST</Text>
              </View>
            ) : null}
            {isClosest ? (
              <View style={[styles.stamp, styles.stampClosest]}>
                <Text style={[styles.stampText, styles.stampTextClosest]}>
                  ⌖ CLOSEST
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.brand} numberOfLines={1}>
              {(station.brand ?? station.name).toUpperCase()}
            </Text>
            {station.brand && station.brand !== station.name ? (
              <Text style={styles.subname} numberOfLines={1}>
                {station.name.toLowerCase()}
              </Text>
            ) : null}
            <Text style={styles.address} numberOfLines={1}>
              {station.address.toLowerCase()}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaPrimary}>
                {formatDistance(station.distance_meters)}
              </Text>
              {station.source_kind !== null && sourceLabel(station.source_kind) ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.meta}>{sourceLabel(station.source_kind)}</Text>
                </>
              ) : null}
              {staleLabel(station.observed_at) ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={[styles.meta, styles.metaStale]}>
                    {staleLabel(station.observed_at)}
                  </Text>
                </>
              ) : null}
              {favorited ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaFav}>♡ saved</Text>
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.right}>
            {station.price_cents === null ? (
              <View style={[styles.pumpDisplay, styles.pumpDisplayEmpty]}>
                <Text style={styles.priceEmpty}>—.—</Text>
              </View>
            ) : (
              <View style={styles.pumpDisplay}>
                <Text style={styles.priceWhole}>
                  {Math.floor(station.price_cents / 100)}
                </Text>
                <Text style={styles.priceDot}>.</Text>
                <Text style={styles.priceFraction}>
                  {(station.price_cents % 100).toString().padStart(2, '0')}
                </Text>
              </View>
            )}
            <Text style={styles.octaneTag}>
              {station.octane !== null ? `${station.octane} OCTANE` : 'NO PRICE YET'}
            </Text>
          </View>
        </View>

        {savings ? (
          <View style={styles.savingsRow}>
            <View
              style={[
                styles.savingsBadge,
                positive ? styles.savingsBadgePositive : styles.savingsBadgeNegative,
              ]}>
              <Text
                style={[
                  styles.savingsText,
                  positive ? styles.savingsTextPositive : styles.savingsTextNegative,
                ]}>
                {savings}
              </Text>
            </View>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

function sourceLabel(kind: StationWithPrice['source_kind']): string | null {
  if (kind === null) return null;
  switch (kind) {
    case 'scrape':
      return 'auto';
    case 'crowd':
      return 'reported';
    case 'official':
      return 'verified';
    case 'google':
      return 'live';
    default: {
      const never: never = kind;
      void never;
      return null;
    }
  }
}

void formatPriceCents;

function makeStyles({ colors, fonts, radius, shadow, space }: Theme) {
  return StyleSheet.create({
    card: {
      marginHorizontal: space.lg,
      marginVertical: space.sm,
      paddingHorizontal: space.lg,
      paddingVertical: space.lg,
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      ...shadow.card,
    },
    cardCheapest: {
      borderColor: colors.rust,
      borderWidth: 1.5,
    },
    cardPressed: { opacity: 0.85 },
    stampRow: {
      position: 'absolute',
      top: -10,
      left: 14,
      flexDirection: 'row',
      gap: 6,
    },
    stamp: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 4,
      ...shadow.panel,
    },
    stampCheapest: {
      backgroundColor: colors.rust,
      transform: [{ rotate: '-3deg' }],
    },
    stampClosest: {
      backgroundColor: colors.amber,
      transform: [{ rotate: '2deg' }],
    },
    stampText: {
      fontFamily: fonts.bodyBold,
      color: colors.paper,
      fontSize: 10,
      letterSpacing: 1.5,
    },
    stampTextClosest: {
      color: colors.ink,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    left: { flex: 1 },
    brand: {
      fontFamily: fonts.display,
      fontSize: 20,
      color: colors.ink,
      letterSpacing: 1,
    },
    subname: {
      fontFamily: fonts.bodyItalic,
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 1,
    },
    address: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
      marginTop: 4,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 8,
    },
    metaPrimary: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.rust,
      letterSpacing: 0.4,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.inkSoft,
    },
    metaStale: { color: colors.amberDark },
    metaFav: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: colors.rust,
    },
    metaDot: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.inkFaint,
      marginHorizontal: 6,
    },
    right: { alignItems: 'flex-end', minWidth: 96 },
    pumpDisplay: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.ink,
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 4,
      borderRadius: 6,
    },
    pumpDisplayEmpty: {
      opacity: 0.5,
    },
    priceEmpty: {
      fontFamily: fonts.priceHeavy,
      fontSize: 22,
      color: colors.amber,
      lineHeight: 24,
      letterSpacing: 1,
    },
    priceWhole: {
      fontFamily: fonts.priceHeavy,
      fontSize: 22,
      color: colors.amber,
      lineHeight: 24,
    },
    priceDot: {
      fontFamily: fonts.priceHeavy,
      fontSize: 22,
      color: colors.amber,
      lineHeight: 24,
      marginHorizontal: 1,
    },
    priceFraction: {
      fontFamily: fonts.priceHeavy,
      fontSize: 16,
      color: colors.amber,
      lineHeight: 24,
      marginBottom: 1,
    },
    octaneTag: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.inkFaint,
      letterSpacing: 1.5,
      marginTop: 6,
    },
    savingsRow: {
      flexDirection: 'row',
      marginTop: space.md,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.paperEdge,
    },
    savingsBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 4,
    },
    savingsBadgePositive: {
      backgroundColor: colors.amber,
    },
    savingsBadgeNegative: {
      backgroundColor: colors.dust,
    },
    savingsText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
    },
    savingsTextPositive: { color: colors.ink },
    savingsTextNegative: { color: colors.inkSoft },
  });
}
