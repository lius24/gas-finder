// Airtable "Editorial" layout for the Pumps tab — white canvas, sober
// Archivo grotesk type, voltage from full-bleed signature-color station
// cards in coral/forest/cream/peach/mustard/mint rotation. Ports
// preview/airtable.html into React Native Web.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatSavingsRange,
  type AnnotatedStation,
} from '@/lib/decision-math';
import { formatDistance } from '@/lib/geo';
import { staleLabel } from '@/lib/staleness';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';
import type { PumpsData } from '@/hooks/use-pumps-data';

// Signature color rotation — each station card gets one. Mirrors the
// Airtable signature palette (coral / forest / cream / peach / mustard /
// mint) and cycles by rank.
const COLOR_ROTATION = [
  { bg: '#aa2d00', fg: '#ffffff', kicker: 'rgba(255,255,255,0.85)' }, // coral
  { bg: '#0a2e0e', fg: '#ffffff', kicker: 'rgba(255,255,255,0.85)' }, // forest
  { bg: '#f5e9d4', fg: '#181d26', kicker: '#5a606b' }, // cream (light)
  { bg: '#fcab79', fg: '#181d26', kicker: '#333840' }, // peach (light)
  { bg: '#d9a441', fg: '#181d26', kicker: '#333840' }, // mustard (light)
  { bg: '#a8d8c4', fg: '#181d26', kicker: '#333840' }, // mint (light)
];

export function AirtablePumpsView({ data }: { data: PumpsData }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  const {
    sortedStations,
    stations,
    cheapestId,
    closestId,
    hiddenUnpriced,
    loading,
    refreshing,
    error,
    octane,
    setOctane,
    radius,
    setRadius,
    sort,
    setSort,
    usingCurrentLocation,
    currentLocationLabel,
    searchInput,
    setSearchInput,
    searchLabel,
    searching,
    applyCurrentLocation,
    submitSearch,
    onRefresh,
    onManualRefreshPrices,
  } = data;

  const renderStation = ({ item, index }: { item: AnnotatedStation; index: number }) => {
    const palette = COLOR_ROTATION[index % COLOR_ROTATION.length];
    const isCheapest = item.id === cheapestId;
    const isClosest = item.id === closestId;
    const savingsText = item.savings ? formatSavingsRange(item.savings) : null;
    const positive = item.savings ? item.savings.centralDollars > 0 : false;
    const stale = staleLabel(item.observed_at);

    return (
      <Link
        href={{
          pathname: '/station/[id]',
          params: { id: item.id, seed: JSON.stringify(item) },
        }}
        asChild>
        <Pressable
          style={({ pressed }) => [
            styles.feature,
            { backgroundColor: palette.bg },
            pressed && styles.featurePressed,
          ]}>
          <View style={styles.featureLeft}>
            <Text style={[styles.featureKicker, { color: palette.kicker }]}>
              {isCheapest
                ? '★ Cheapest premium'
                : isClosest
                  ? '⌖ Closest · baseline'
                  : `0${index + 1}`}
            </Text>
            <Text style={[styles.featureBrand, { color: palette.fg }]} numberOfLines={2}>
              {item.brand ?? item.name}
            </Text>
            <Text
              style={[styles.featureAddr, { color: palette.fg, opacity: 0.85 }]}
              numberOfLines={1}>
              {item.address} · {formatDistance(item.distance_meters)}
            </Text>
            <Text
              style={[styles.featureMeta, { color: palette.kicker }]}
              numberOfLines={1}>
              {item.source_kind === 'google' ? 'Live · Google Places' : 'Reported'}
              {stale ? ` · ${stale}` : ''}
            </Text>
          </View>
          <View style={styles.featureRight}>
            {item.price_cents !== null ? (
              <Text style={[styles.featurePrice, { color: palette.fg }]}>
                ${Math.floor(item.price_cents / 100)}.
                <Text style={[styles.featurePriceFrac, { color: palette.fg, opacity: 0.55 }]}>
                  {(item.price_cents % 100).toString().padStart(2, '0')}
                </Text>
              </Text>
            ) : (
              <Text style={[styles.featurePriceFrac, { color: palette.fg, opacity: 0.6 }]}>
                —.—
              </Text>
            )}
            <Text style={[styles.featureOct, { color: palette.kicker }]}>
              {item.octane ?? '—'} octane
            </Text>
          </View>
          {savingsText ? (
            <View style={styles.featureSavings}>
              <View
                style={[
                  styles.featureSavingsTag,
                  { backgroundColor: palette.fg === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)' },
                ]}>
                <Text
                  style={[
                    styles.featureSavingsTagText,
                    { color: palette.fg },
                  ]}>
                  {positive ? 'Save' : 'Costs'}{' '}
                  {savingsText
                    .replace('Save ', '')
                    .replace('Costs ', '')}
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Link>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={sortedStations}
        keyExtractor={(s) => s.id}
        renderItem={renderStation}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <Text style={styles.kicker}>PREMIUM FUEL · LIVE</Text>
            <Text style={styles.hero}>
              Find the premium pump{' '}
              <Text style={styles.heroEm}>worth driving for.</Text>
            </Text>
            <Text style={styles.lede}>
              Authoritative pump-feed prices. Net-savings math. No crowd guesses, no
              interstitials. Six premium pumps within five miles, ranked by what your
              tank actually costs after the drive.
            </Text>

            {/* Location pill */}
            <Pressable
              onPress={applyCurrentLocation}
              style={({ pressed }) => [styles.locCard, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.locLabel}>
                  {usingCurrentLocation ? 'YOU ARE HERE' : 'VIEWING'}
                </Text>
                <Text style={styles.locValue} numberOfLines={1}>
                  {usingCurrentLocation
                    ? currentLocationLabel ?? 'somewhere on a road'
                    : searchLabel ?? '—'}
                </Text>
              </View>
              <Ionicons
                name={usingCurrentLocation ? 'navigate' : 'location'}
                size={16}
                color={colors.rust}
              />
            </Pressable>

            {/* Search */}
            <View style={styles.searchRow}>
              <Ionicons name="search" size={14} color={colors.inkFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search a city, zip, or address"
                placeholderTextColor={colors.inkFaint}
                value={searchInput}
                onChangeText={setSearchInput}
                returnKeyType="search"
                onSubmitEditing={submitSearch}
                editable={!searching}
                autoCapitalize="none"
              />
              {searching ? <ActivityIndicator size="small" color={colors.rust} /> : null}
            </View>

            <Text style={styles.sectionHead}>Six pumps. Color-coded by ranking.</Text>
            <Text style={styles.sectionSub}>
              Each card is a single observation timestamped by Google Places, with net
              savings computed against the closest priced baseline.
            </Text>

            {/* Segmented octane control */}
            <View style={styles.segmented}>
              {(['87', '89'] as const).map((label) => {
                const num = Number(label) as 87 | 89;
                const active = octane === num;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setOctane(num)}
                    style={[styles.segCell, active && styles.segCellActive]}>
                    <Text style={[styles.segText, active && styles.segTextActive]}>
                      {num}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setOctane('premium')}
                style={[
                  styles.segCell,
                  styles.segCellPrem,
                  octane === 'premium' && styles.segCellPremActive,
                ]}>
                <Text
                  style={[
                    styles.segText,
                    octane === 'premium' && styles.segTextPremActive,
                  ]}>
                  91+ Any premium
                </Text>
              </Pressable>
            </View>

            {/* Inline link sort/radius */}
            <View style={styles.linkRow}>
              <Text style={styles.linkRowLabel}>Sort</Text>
              {(['cheapest', 'closest'] as const).map((k) => {
                const active = sort === k;
                return (
                  <Pressable key={k} onPress={() => setSort(k)}>
                    <Text style={[styles.linkText, active && styles.linkTextActive]}>
                      {k === 'cheapest' ? 'Cheapest' : 'Closest'}
                    </Text>
                  </Pressable>
                );
              })}
              <Text style={styles.linkRowDot}>·</Text>
              <Text style={styles.linkRowLabel}>Radius</Text>
              {[1609, 4828, 8047, 16093].map((m) => {
                const active = radius === m;
                return (
                  <Pressable key={m} onPress={() => setRadius(m as any)}>
                    <Text style={[styles.linkText, active && styles.linkTextActive]}>
                      {radiusMiLabel(m)} mi
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {loading ? (
              <ActivityIndicator color={colors.rust} style={{ marginTop: 24 }} />
            ) : error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{error}</Text>
                {error.toLowerCase().includes('permission') ? (
                  <Pressable
                    style={styles.errorBtn}
                    onPress={() => Linking.openSettings()}>
                    <Text style={styles.errorBtnText}>Open Settings</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && stations.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                No stations within {radiusMiLabel(radius)} mi.
              </Text>
            </View>
          ) : !loading && stations.every((s) => s.price_cents === null) ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                Stations are here, but no prices for{' '}
                {octane === 'premium' ? 'any premium octane' : `${octane} octane`} yet.
              </Text>
              <Pressable style={styles.errorBtn} onPress={onManualRefreshPrices}>
                <Text style={styles.errorBtnText}>Refresh prices</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListFooterComponent={
          sortedStations.length > 0 && hiddenUnpriced > 0 ? (
            <Text style={styles.hiddenNote}>
              + {hiddenUnpriced} nearby station
              {hiddenUnpriced === 1 ? '' : 's'} without premium data yet
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function radiusMiLabel(m: number): string {
  if (m === 1609) return '1';
  if (m === 4828) return '3';
  if (m === 8047) return '5';
  return '10';
}

function makeStyles({ colors, fonts, radius, space }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: 16 },

    headerStack: { paddingTop: space.lg, gap: 16 },

    kicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.rust,
      letterSpacing: 0.4,
    },
    hero: {
      fontFamily: fonts.display,
      fontSize: 36,
      color: colors.ink,
      letterSpacing: -1,
      lineHeight: 40,
    },
    heroEm: {
      color: colors.rust,
      textDecorationLine: 'underline',
    },
    lede: {
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.inkSoft,
      lineHeight: 22,
      marginBottom: 8,
    },

    locCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.paper,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },
    locLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.rust,
      letterSpacing: 1.5,
      marginBottom: 2,
    },
    locValue: {
      fontFamily: fonts.display,
      fontSize: 16,
      color: colors.ink,
    },
    pressed: { opacity: 0.7 },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      marginBottom: 8,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.ink,
    },

    sectionHead: {
      fontFamily: fonts.display,
      fontSize: 26,
      color: colors.ink,
      letterSpacing: -0.6,
      marginTop: 12,
    },
    sectionSub: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkSoft,
      lineHeight: 20,
    },

    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.dust,
      borderRadius: 9999,
      padding: 4,
      gap: 4,
      alignSelf: 'flex-start',
    },
    segCell: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 9999,
    },
    segCellActive: { backgroundColor: colors.paper },
    segCellPrem: {},
    segCellPremActive: { backgroundColor: colors.rust },
    segText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: colors.inkSoft,
    },
    segTextActive: { color: colors.ink, fontFamily: fonts.bodyBold },
    segTextPremActive: { color: colors.onRust, fontFamily: fonts.bodyBold },

    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
    },
    linkRowLabel: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkFaint,
    },
    linkRowDot: { color: colors.inkFaint, fontSize: 14 },
    linkText: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkSoft,
    },
    linkTextActive: {
      color: colors.ink,
      fontFamily: fonts.bodyBold,
    },

    /* Stations — full-bleed signature-color cards */
    feature: {
      borderRadius: radius.xl,
      padding: 24,
      gap: 6,
    },
    featurePressed: { opacity: 0.9 },
    featureLeft: { gap: 4 },
    featureKicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 0.3,
    },
    featureBrand: {
      fontFamily: fonts.display,
      fontSize: 28,
      letterSpacing: -0.6,
      lineHeight: 30,
      marginTop: 2,
    },
    featureAddr: {
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
    },
    featureMeta: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      marginTop: 4,
    },
    featureRight: {
      marginTop: 16,
      alignItems: 'flex-end',
    },
    featurePrice: {
      fontFamily: fonts.priceHeavy,
      fontSize: 56,
      lineHeight: 56,
      letterSpacing: -2,
    },
    featurePriceFrac: {
      fontFamily: fonts.priceHeavy,
      fontSize: 30,
    },
    featureOct: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 0.3,
      marginTop: 4,
    },
    featureSavings: {
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.2)',
    },
    featureSavingsTag: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 9999,
    },
    featureSavingsTagText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },

    hiddenNote: {
      fontFamily: fonts.bodyItalic,
      fontSize: 14,
      color: colors.inkFaint,
      textAlign: 'center',
      marginTop: 24,
    },

    emptyWrap: { padding: 40, alignItems: 'center', gap: 12 },
    emptyText: {
      fontFamily: fonts.bodyItalic,
      fontSize: 14,
      color: colors.inkFaint,
      textAlign: 'center',
    },
    errorWrap: { padding: 24, alignItems: 'center', gap: 12 },
    errorText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: colors.danger,
      textAlign: 'center',
    },
    errorBtn: {
      paddingHorizontal: 22,
      paddingVertical: 11,
      backgroundColor: colors.rust,
      borderRadius: 9999,
    },
    errorBtnText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: colors.onRust,
    },
  });
}
