// Ferrari "Edizione Corsa" layout for the Pumps tab — cinematic near-
// black canvas, modest-weight italic display titles, Rosso Corsa as
// scarce voltage, a top telemetry strip, and a grid of dark cards with
// Rosso accents on the cheapest pump. Ports preview/ferrari.html into
// React Native Web.
//
// Uses usePumpsData() for state + actions; no scroll-collapse animation
// (the Desert view's hallmark worklet stays Desert-only).

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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

export function FerrariPumpsView({ data }: { data: PumpsData }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const { width } = useWindowDimensions();
  const columns = width >= 1024 ? 3 : width >= 700 ? 2 : 1;

  const {
    sortedStations,
    stations,
    annotatedStations,
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

  // Telemetry derived from the live data
  const tStations = stations.length;
  const tPriced = annotatedStations.filter((s) => s.price_cents !== null).length;
  const cheapestStation =
    cheapestId != null ? stations.find((s) => s.id === cheapestId) ?? null : null;
  const baselineStation = annotatedStations.find((s) => s.isBaseline) ?? null;
  const cheapestPriceLabel =
    cheapestStation?.price_cents != null
      ? `$${(cheapestStation.price_cents / 100).toFixed(2)}`
      : '—';
  const topSavings = sortedStations.find((s) => s.savings)?.savings ?? null;
  const topSavingsLabel = topSavings
    ? (topSavings.centralDollars > 0 ? '+' : '−') +
      '$' +
      Math.abs(topSavings.centralDollars).toFixed(2)
    : '—';

  const renderStation = ({ item }: { item: AnnotatedStation }) => {
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
            styles.card,
            isCheapest && styles.cardCheapest,
            pressed && styles.cardPressed,
            { flex: 1 / columns, margin: 6 },
          ]}>
          <View style={styles.cardHead}>
            <Text style={styles.cardRank}>
              {isCheapest ? '01 · CHEAPEST' : isClosest ? '⌖ CLOSEST · BASELINE' : ''}
            </Text>
          </View>
          <Text style={styles.cardBrand} numberOfLines={1}>
            {(item.brand ?? item.name).toUpperCase()}
          </Text>
          <Text style={styles.cardAddr} numberOfLines={1}>
            {item.address.toLowerCase()}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>{formatDistance(item.distance_meters)}</Text>
            <View style={styles.cardMetaDot} />
            <Text style={styles.cardMetaText}>LIVE · PLACES</Text>
            {stale ? (
              <>
                <View style={styles.cardMetaDot} />
                <Text style={[styles.cardMetaText, styles.cardMetaStale]}>{stale}</Text>
              </>
            ) : null}
          </View>

          <View style={styles.cardPriceRow}>
            {item.price_cents !== null ? (
              <Text style={styles.cardPrice}>
                ${Math.floor(item.price_cents / 100)}.
                <Text style={styles.cardPriceFrac}>
                  {(item.price_cents % 100).toString().padStart(2, '0')}
                </Text>
              </Text>
            ) : (
              <Text style={styles.cardPriceEmpty}>—.—</Text>
            )}
            <View style={styles.cardOctRight}>
              <Text style={styles.cardOctNum}>{item.octane ?? ''}</Text>
              <Text style={styles.cardOctLabel}>OCTANE</Text>
            </View>
          </View>

          {savingsText ? (
            <View style={styles.savingsRow}>
              <Text
                style={[
                  styles.savingsVerb,
                  !positive && styles.savingsVerbCost,
                ]}>
                {positive ? 'SAVE' : 'COSTS'}
              </Text>
              <Text style={styles.savingsAmt}>
                {savingsText
                  .replace('Save ', '')
                  .replace('Costs ', '')
                  .replace(' extra', ' extra / fill-up')
                  .replace(/^\$/, '$')}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Link>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.tricolor}>
        <View style={[styles.tricolorBand, { backgroundColor: '#0066b1' }]} />
        <View style={[styles.tricolorBand, { backgroundColor: '#1c69d4' }]} />
        <View style={[styles.tricolorBand, { backgroundColor: '#e22718' }]} />
      </View>

      <FlatList
        key={`grid-${columns}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.columnWrap : undefined}
        data={sortedStations}
        keyExtractor={(s) => s.id}
        renderItem={renderStation}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <View style={styles.heroEyebrow}>
              <View style={styles.heroEyebrowRule} />
              <Text style={styles.heroEyebrowText}>
                EDIZIONE CORSA · PREMIUM FUEL INTELLIGENCE
              </Text>
            </View>
            <Text style={styles.heroTitle}>
              A price worth{'\n'}
              <Text style={styles.heroTitleEm}>driving</Text> for.
            </Text>
            <Text style={styles.heroLede}>
              Authoritative pump-feed prices with net-savings math built in.
              Premium pumps near you, ranked by what your tank actually costs.
            </Text>

            <View style={styles.telemetry}>
              <View style={styles.telCell}>
                <Text style={styles.telNum}>
                  {tPriced}
                  <Text style={styles.telNumUnit}> / {tStations}</Text>
                </Text>
                <Text style={styles.telLabel}>STATIONS WITH PREMIUM</Text>
              </View>
              <View style={styles.telCell}>
                <Text style={[styles.telNum, styles.telNumAccent]}>{cheapestPriceLabel}</Text>
                <Text style={styles.telLabel}>CHEAPEST · {radiusMiLabel(radius)} MI</Text>
              </View>
              <View style={styles.telCell}>
                <Text style={styles.telNum}>{topSavingsLabel}</Text>
                <Text style={styles.telLabel}>TOP NET SAVINGS vs CLOSEST</Text>
              </View>
            </View>

            {/* Location pill */}
            <Pressable
              onPress={applyCurrentLocation}
              style={({ pressed }) => [styles.locPill, pressed && styles.pressed]}>
              <Ionicons
                name={usingCurrentLocation ? 'navigate' : 'location'}
                size={14}
                color={colors.rust}
              />
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
              {!usingCurrentLocation ? (
                <View style={styles.gpsPill}>
                  <Text style={styles.gpsPillText}>USE GPS</Text>
                </View>
              ) : null}
            </Pressable>

            {/* Search */}
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={14} color={colors.inkFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="search city, zip, or address"
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

            {/* Section header */}
            <Text style={styles.sectionHead}>Premium pumps near you</Text>

            {/* Octane bar */}
            <View style={styles.octaneBar}>
              {(['87', '89'] as const).map((label) => {
                const num = Number(label) as 87 | 89;
                const active = octane === num;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setOctane(num)}
                    style={[styles.octCell, active && styles.octCellActive]}>
                    <Text style={[styles.octNum, active && styles.octNumActive]}>{num}</Text>
                    <Text style={[styles.octSub, active && styles.octSubActive]}>
                      {num === 87 ? 'REG' : 'MID'}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setOctane('premium')}
                style={[
                  styles.octCell,
                  styles.octCellPrem,
                  octane === 'premium' && styles.octCellPremActive,
                ]}>
                <Text
                  style={[
                    styles.octNumPrem,
                    octane === 'premium' && styles.octNumPremActive,
                  ]}>
                  91+
                </Text>
                <Text
                  style={[
                    styles.octSubPrem,
                    octane === 'premium' && styles.octSubPremActive,
                  ]}>
                  ANY PREM
                </Text>
              </Pressable>
            </View>

            {/* Sort + radius */}
            <View style={styles.controlsRow}>
              <Text style={styles.controlsLabel}>SORT</Text>
              {(['cheapest', 'closest'] as const).map((k) => {
                const active = sort === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setSort(k)}
                    style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {k === 'cheapest' ? 'CHEAPEST' : 'CLOSEST'}
                    </Text>
                  </Pressable>
                );
              })}
              <View style={{ width: 16 }} />
              <Text style={styles.controlsLabel}>RADIUS</Text>
              {[1609, 4828, 8047, 16093].map((m) => {
                const active = radius === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setRadius(m as any)}
                    style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {radiusMiLabel(m)} MI
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
                    <Text style={styles.errorBtnText}>OPEN SETTINGS</Text>
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
                <Text style={styles.errorBtnText}>REFRESH PRICES</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListFooterComponent={
          sortedStations.length > 0 ? (
            <>
              {hiddenUnpriced > 0 ? (
                <Text style={styles.hiddenNote}>
                  + {hiddenUnpriced} nearby station
                  {hiddenUnpriced === 1 ? '' : 's'} without premium data yet
                </Text>
              ) : null}
              <View style={styles.livery}>
                <Text style={styles.liveryText}>
                  Rosso marks the moments that matter.
                </Text>
              </View>
            </>
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
    tricolor: { flexDirection: 'row', height: 3 },
    tricolorBand: { flex: 1 },

    headerStack: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 16 },

    heroEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    heroEyebrowRule: { width: 28, height: 1, backgroundColor: colors.rust },
    heroEyebrowText: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.rust,
      letterSpacing: 1.5,
    },

    heroTitle: {
      fontFamily: fonts.display,
      fontSize: 52,
      lineHeight: 54,
      color: colors.ink,
      letterSpacing: -1.5,
      marginBottom: 12,
    },
    heroTitleEm: {
      fontFamily: fonts.displayItalic,
      color: colors.inkSoft,
    },
    heroLede: {
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
      color: colors.inkSoft,
      marginBottom: 28,
      maxWidth: 540,
    },

    telemetry: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.paperEdge,
      marginBottom: 24,
    },
    telCell: {
      flex: 1,
      paddingVertical: 16,
      paddingRight: 12,
      borderRightWidth: 1,
      borderRightColor: colors.paperEdge,
    },
    telNum: {
      fontFamily: fonts.priceHeavy,
      fontSize: 28,
      letterSpacing: -1,
      color: colors.ink,
      lineHeight: 30,
    },
    telNumAccent: { color: colors.rust },
    telNumUnit: { color: colors.inkFaint, fontWeight: '400' },
    telLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.inkFaint,
      letterSpacing: 1.5,
      marginTop: 6,
    },

    locPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      marginBottom: 12,
    },
    locLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.rust,
      letterSpacing: 2.5,
      marginBottom: 2,
    },
    locValue: {
      fontFamily: fonts.display,
      fontSize: 16,
      color: colors.ink,
      lineHeight: 18,
    },
    gpsPill: {
      backgroundColor: colors.displaySurface,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 4,
    },
    gpsPillText: {
      color: colors.displayInk,
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 1.5,
    },
    pressed: { opacity: 0.7 },

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      marginBottom: 24,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.ink,
    },

    sectionHead: {
      fontFamily: fonts.display,
      fontSize: 28,
      letterSpacing: -0.7,
      color: colors.ink,
      marginBottom: 16,
    },

    octaneBar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.paperEdge,
      marginBottom: 16,
    },
    octCell: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      borderRightWidth: 1,
      borderRightColor: colors.paperEdge,
    },
    octCellActive: { backgroundColor: colors.displaySurface },
    octNum: {
      fontFamily: fonts.priceHeavy,
      fontSize: 22,
      color: colors.inkSoft,
    },
    octNumActive: { color: colors.displayInk },
    octSub: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.inkFaint,
      letterSpacing: 1.5,
      marginTop: 3,
    },
    octSubActive: { color: colors.displayInk, opacity: 0.85 },

    octCellPrem: {
      flex: 1.4,
      backgroundColor: colors.paper,
      borderLeftWidth: 3,
      borderLeftColor: colors.rust,
      borderRightWidth: 0,
    },
    octCellPremActive: { backgroundColor: colors.rust, borderLeftColor: colors.rust },
    octNumPrem: {
      fontFamily: fonts.priceHeavy,
      fontSize: 22,
      color: colors.rust,
    },
    octNumPremActive: { color: colors.onRust },
    octSubPrem: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.rust,
      letterSpacing: 1.5,
      marginTop: 3,
    },
    octSubPremActive: { color: colors.onRust, opacity: 0.92 },

    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 24,
      flexWrap: 'wrap',
    },
    controlsLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.inkFaint,
      letterSpacing: 1.5,
    },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      backgroundColor: 'transparent',
    },
    pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    pillText: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.inkSoft,
      letterSpacing: 1.4,
    },
    pillTextActive: { color: colors.bg },

    list: { paddingHorizontal: space.sm, paddingBottom: space.xxl },
    columnWrap: { gap: 0 },

    card: {
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      padding: 18,
      gap: 6,
      minHeight: 220,
    },
    cardCheapest: { borderColor: colors.rust, borderWidth: 1.5 },
    cardPressed: { opacity: 0.85 },

    cardHead: { minHeight: 14 },
    cardRank: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.rust,
      letterSpacing: 1.5,
    },

    cardBrand: {
      fontFamily: fonts.display,
      fontSize: 22,
      color: colors.ink,
      letterSpacing: -0.4,
      lineHeight: 24,
    },
    cardAddr: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 4,
    },
    cardMetaText: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.inkFaint,
      letterSpacing: 1,
    },
    cardMetaStale: { color: colors.amberDark },
    cardMetaDot: {
      width: 3,
      height: 3,
      backgroundColor: colors.inkFaint,
      borderRadius: 50,
    },

    cardPriceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.paperEdge,
      paddingTop: 12,
      marginTop: 8,
    },
    cardPrice: {
      fontFamily: fonts.priceHeavy,
      fontSize: 36,
      color: colors.ink,
      letterSpacing: -1.2,
      lineHeight: 36,
    },
    cardPriceFrac: { fontSize: 22, color: colors.inkSoft },
    cardPriceEmpty: {
      fontFamily: fonts.priceHeavy,
      fontSize: 24,
      color: colors.inkFaint,
      letterSpacing: 1,
    },
    cardOctRight: { alignItems: 'flex-end' },
    cardOctNum: {
      fontFamily: fonts.priceHeavy,
      fontSize: 18,
      color: colors.rust,
      letterSpacing: -0.3,
    },
    cardOctLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 8,
      color: colors.inkFaint,
      letterSpacing: 1.2,
      marginTop: 2,
    },

    savingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.paperEdge,
      paddingTop: 10,
      marginTop: 8,
      flexWrap: 'wrap',
    },
    savingsVerb: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.good,
      letterSpacing: 1.5,
    },
    savingsVerbCost: { color: colors.danger },
    savingsAmt: {
      fontFamily: fonts.numeral,
      fontSize: 12,
      color: colors.inkSoft,
    },

    hiddenNote: {
      fontFamily: fonts.bodyItalic,
      fontSize: 12,
      color: colors.inkFaint,
      textAlign: 'center',
      marginTop: 24,
      marginBottom: 12,
    },
    livery: {
      backgroundColor: colors.rust,
      paddingVertical: 24,
      paddingHorizontal: space.lg,
      alignItems: 'center',
      marginTop: 16,
    },
    liveryText: {
      fontFamily: fonts.displayItalic,
      fontSize: 14,
      color: colors.onRust,
      letterSpacing: 0,
      textAlign: 'center',
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
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.rust,
    },
    errorBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.onRust,
      letterSpacing: 1.4,
    },
  });
}

// Suppress unused-import warning on ScrollView/columns when grid is single-col.
void ScrollView;
