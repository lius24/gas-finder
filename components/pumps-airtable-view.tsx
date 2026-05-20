// Airtable "Editorial" Pumps view — sober white canvas, modest Archivo
// grotesk type, brand voltage from signature-colored full-bleed cards
// (coral / forest / cream / peach / mustard / mint). Near-black pill
// CTAs. Ports public/preview/airtable.html into React Native Web.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PumpsData } from '@/hooks/use-pumps-data';
import { formatSavingsRange, type AnnotatedStation } from '@/lib/decision-math';
import { formatDistance } from '@/lib/geo';
import { staleLabel } from '@/lib/staleness';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

// Signature color rotation — each station card gets one. Mirrors the
// Airtable signature palette (coral / forest / cream / peach / mustard /
// mint) and cycles by rank. The "dark" flag drives white-on-dark vs
// ink-on-light variants so the Directions CTA + savings tag stay legible.
type Palette = {
  bg: string;
  fg: string;
  kicker: string;
  ctaBg: string;
  ctaFg: string;
  tagBg: string;
  hairline: string;
  dark: boolean;
};
// Sample stations shown in the empty state so the signature-color palette
// rotation is visible immediately. Pulled from the preview HTML so the
// in-app empty state mirrors the marketing promise. These are placeholders
// only — replaced by live data once stations load.
const SAMPLE_STATIONS = [
  {
    brand: 'Sunoco',
    addr: '125 Hoosick St · 2.0 mi',
    dollars: '5',
    cents: '30',
    octane: '93',
    kicker: '★ Cheapest premium · sample',
  },
  {
    brand: "Stewart's Shops",
    addr: '110 Hoosick St · 1.4 mi',
    dollars: '5',
    cents: '56',
    octane: '91',
    kicker: '02 · brand-set premium',
  },
  {
    brand: "Stewart's Shops",
    addr: '8 Vandenburgh Ave · 0.5 mi',
    dollars: '5',
    cents: '66',
    octane: '91',
    kicker: '03 · ⌖ closest · baseline',
  },
  {
    brand: 'Speedway',
    addr: '175 Hoosick St · 2.1 mi',
    dollars: '5',
    cents: '40',
    octane: '93',
    kicker: '04 · live · Places',
  },
  {
    brand: 'Gulf',
    addr: '95 Hill St · 1.8 mi',
    dollars: '5',
    cents: '40',
    octane: '93',
    kicker: '05 · same price, longer drive',
  },
  {
    brand: 'Cumberland Farms',
    addr: '625 Pawling Ave · 3.4 mi',
    dollars: '5',
    cents: '50',
    octane: '93',
    kicker: '06 · live · Places',
  },
];

const COLOR_ROTATION: Palette[] = [
  // 01 coral — cheapest
  {
    bg: '#aa2d00',
    fg: '#ffffff',
    kicker: 'rgba(255,255,255,0.85)',
    ctaBg: 'rgba(255,255,255,0.95)',
    ctaFg: '#181d26',
    tagBg: 'rgba(255,255,255,0.18)',
    hairline: 'rgba(255,255,255,0.22)',
    dark: true,
  },
  // 02 forest
  {
    bg: '#0a2e0e',
    fg: '#ffffff',
    kicker: 'rgba(255,255,255,0.85)',
    ctaBg: 'rgba(255,255,255,0.95)',
    ctaFg: '#181d26',
    tagBg: 'rgba(255,255,255,0.18)',
    hairline: 'rgba(255,255,255,0.22)',
    dark: true,
  },
  // 03 cream — typically the baseline
  {
    bg: '#f5e9d4',
    fg: '#181d26',
    kicker: '#5a606b',
    ctaBg: '#181d26',
    ctaFg: '#ffffff',
    tagBg: 'rgba(0,0,0,0.08)',
    hairline: 'rgba(0,0,0,0.12)',
    dark: false,
  },
  // 04 peach
  {
    bg: '#fcab79',
    fg: '#181d26',
    kicker: '#333840',
    ctaBg: '#181d26',
    ctaFg: '#ffffff',
    tagBg: 'rgba(0,0,0,0.1)',
    hairline: 'rgba(0,0,0,0.12)',
    dark: false,
  },
  // 05 mustard
  {
    bg: '#d9a441',
    fg: '#181d26',
    kicker: '#333840',
    ctaBg: '#181d26',
    ctaFg: '#ffffff',
    tagBg: 'rgba(0,0,0,0.1)',
    hairline: 'rgba(0,0,0,0.14)',
    dark: false,
  },
  // 06 mint
  {
    bg: '#a8d8c4',
    fg: '#181d26',
    kicker: '#333840',
    ctaBg: '#181d26',
    ctaFg: '#ffffff',
    tagBg: 'rgba(0,0,0,0.1)',
    hairline: 'rgba(0,0,0,0.12)',
    dark: false,
  },
];

export function AirtablePumpsView({ data }: { data: PumpsData }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme, width), [theme, width]);
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
    const rank = (index + 1).toString().padStart(2, '0');

    const kickerText = isCheapest
      ? '★ Cheapest premium · 5 mi radius'
      : isClosest
        ? `${rank} · ⌖ closest · baseline`
        : `${rank} · ${item.brand ?? item.name}`;

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
          {/* Top row: brand / address  |  price block */}
          <View style={styles.featureBody}>
            <View style={styles.featureLeft}>
              <Text style={[styles.featureKicker, { color: palette.kicker }]} numberOfLines={1}>
                {kickerText}
              </Text>
              <Text style={[styles.featureBrand, { color: palette.fg }]} numberOfLines={2}>
                {item.brand ?? item.name}
              </Text>
              <Text
                style={[styles.featureAddr, { color: palette.fg, opacity: 0.85 }]}
                numberOfLines={2}>
                {item.address} · {formatDistance(item.distance_meters)}
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
                <Text style={[styles.featurePriceEmpty, { color: palette.fg, opacity: 0.55 }]}>
                  —.—
                </Text>
              )}
              <Text
                style={[styles.featureOct, { color: palette.kicker }]}
                numberOfLines={1}>
                {item.octane ?? '—'} octane · Google Places
              </Text>
              {item.price_cents !== null ? (
                <View
                  style={[styles.featureCta, { backgroundColor: palette.ctaBg }]}>
                  <Text style={[styles.featureCtaText, { color: palette.ctaFg }]}>
                    Directions →
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Savings row — only when there's a delta worth showing */}
          {savingsText ? (
            <View
              style={[
                styles.featureSavings,
                { borderTopColor: palette.hairline },
              ]}>
              <View
                style={[
                  styles.featureSavingsTag,
                  { backgroundColor: palette.tagBg },
                ]}>
                <Text
                  style={[
                    styles.featureSavingsTagText,
                    { color: palette.fg },
                  ]}>
                  {positive ? 'Save' : 'Costs'}{' '}
                  {savingsText
                    .replace('Save ', '')
                    .replace('Costs ', '')
                    .replace(' extra', ' extra')}
                </Text>
              </View>
              {isCheapest ? (
                <Text
                  style={[
                    styles.featureSavingsHint,
                    { color: palette.fg, opacity: 0.75 },
                  ]}>
                  net of drive cost vs the closest priced pump
                </Text>
              ) : null}
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
            {/* Hero — title + lede on the left, station "sheet" aside on
                the right (stacks on phones). */}
            <View style={styles.heroGrid}>
              <View style={styles.hero}>
                <Text style={styles.kicker}>Premium fuel · live near you</Text>
                <Text style={styles.heroTitle}>
                  Find the premium pump{' '}
                  <Text style={styles.heroTitleEm}>worth driving for.</Text>
                </Text>
                <Text style={styles.lede}>
                  Authoritative pump-feed prices. Net-savings math. No crowd
                  guesses, no interstitials. Premium pumps near you, ranked by
                  what your tank actually costs after the drive.
                </Text>
              </View>

              {/* Station sheet — stylized spreadsheet showing the current
                  result set. Uses live sortedStations data. */}
              <View style={styles.sheet}>
                <View style={styles.sheetBar}>
                  <View style={[styles.sheetDot, { backgroundColor: '#ff5f57' }]} />
                  <View style={[styles.sheetDot, { backgroundColor: '#ffbd2e' }]} />
                  <View style={[styles.sheetDot, { backgroundColor: '#28ca42' }]} />
                  <Text style={styles.sheetFilename}>
                    {octane === 'premium' ? 'premium' : `octane-${octane}`}-pumps · {radiusMiLabel(radius)} mi
                  </Text>
                </View>
                <View style={[styles.sheetRow, styles.sheetRowHeader]}>
                  <Text style={[styles.sheetCellIx, styles.sheetCellHeader]}>#</Text>
                  <Text style={[styles.sheetCellName, styles.sheetCellHeader]}>Station</Text>
                  <Text style={[styles.sheetCellMi, styles.sheetCellHeader]}>Mi</Text>
                  <Text style={[styles.sheetCellPrice, styles.sheetCellHeader]}>Price</Text>
                </View>
                {sortedStations.length === 0 ? (
                  <View style={[styles.sheetRow, styles.sheetRowEmpty]}>
                    <Text style={styles.sheetEmptyText}>
                      {loading ? 'Loading…' : 'No premium pumps in range yet.'}
                    </Text>
                  </View>
                ) : (
                  sortedStations.slice(0, 6).map((s, i) => {
                    const isCheap = s.id === cheapestId;
                    const mi = (s.distance_meters / 1609).toFixed(1);
                    const priceLabel =
                      s.price_cents != null
                        ? `$${(s.price_cents / 100).toFixed(2)}`
                        : '—';
                    return (
                      <View
                        key={s.id}
                        style={[styles.sheetRow, isCheap && styles.sheetRowCheap]}>
                        <Text style={styles.sheetCellIx}>{i + 1}</Text>
                        <Text style={styles.sheetCellName} numberOfLines={1}>
                          {s.brand ?? s.name}
                          {s.id === closestId ? ' · closest' : ''}
                        </Text>
                        <Text style={styles.sheetCellMi}>{mi}</Text>
                        <Text
                          style={[
                            styles.sheetCellPrice,
                            isCheap && styles.sheetCellPriceCheap,
                          ]}>
                          {priceLabel}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* Location + search */}
            <Pressable
              onPress={applyCurrentLocation}
              style={({ pressed }) => [styles.locCard, pressed && styles.pressed]}>
              <Ionicons
                name={usingCurrentLocation ? 'navigate' : 'location'}
                size={16}
                color={colors.rust}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.locLabel}>
                  {usingCurrentLocation ? 'You are here' : 'Viewing'}
                </Text>
                <Text style={styles.locValue} numberOfLines={1}>
                  {usingCurrentLocation
                    ? currentLocationLabel ?? 'somewhere on a road'
                    : searchLabel ?? '—'}
                </Text>
              </View>
              {!usingCurrentLocation ? (
                <View style={styles.gpsPill}>
                  <Text style={styles.gpsPillText}>Use GPS</Text>
                </View>
              ) : null}
            </Pressable>

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

            {/* Section head */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionHeadTitle}>
                Pumps. Color-coded by ranking.
              </Text>
              <Text style={styles.sectionHeadSub}>
                Each card is a single observation timestamped by Google Places, with net
                savings computed against the closest priced baseline.
              </Text>
            </View>

            {/* Segmented octane — ink-outline pill */}
            <View style={styles.segWrap}>
              <View style={styles.seg}>
                {(['87', '89'] as const).map((label, idx) => {
                  const num = Number(label) as 87 | 89;
                  const active = octane === num;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setOctane(num)}
                      style={[
                        styles.segCell,
                        idx === 0 && styles.segCellFirst,
                        active && styles.segCellActive,
                      ]}>
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
                    styles.segCellLast,
                    octane === 'premium' && styles.segCellActive,
                  ]}>
                  <Text
                    style={[
                      styles.segText,
                      octane === 'premium' && styles.segTextActive,
                    ]}>
                    91+ Any premium
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Sort + radius — inline text links */}
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
              <Text style={styles.linkRowSpacer}>Radius</Text>
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
          !loading && (stations.length === 0 || stations.every((s) => s.price_cents === null)) ? (
            <View style={styles.emptyWrap}>
              {/* Sample colorful cards — make the signature-color rotation
                  visible even before live data lands. Mirrors the preview's
                  hero promise of "Six pumps. Color-coded by ranking." */}
              <Text style={styles.emptyKicker}>Six pumps. Color-coded by ranking.</Text>
              {SAMPLE_STATIONS.map((sample, i) => {
                const palette = COLOR_ROTATION[i % COLOR_ROTATION.length];
                return (
                  <View
                    key={sample.brand}
                    style={[styles.feature, { backgroundColor: palette.bg }]}>
                    <View style={styles.featureBody}>
                      <View style={styles.featureLeft}>
                        <Text
                          style={[styles.featureKicker, { color: palette.kicker }]}>
                          {sample.kicker}
                        </Text>
                        <Text
                          style={[styles.featureBrand, { color: palette.fg }]}
                          numberOfLines={2}>
                          {sample.brand}
                        </Text>
                        <Text
                          style={[
                            styles.featureAddr,
                            { color: palette.fg, opacity: 0.85 },
                          ]}>
                          {sample.addr}
                        </Text>
                      </View>
                      <View style={styles.featureRight}>
                        <Text style={[styles.featurePrice, { color: palette.fg }]}>
                          ${sample.dollars}.
                          <Text
                            style={[
                              styles.featurePriceFrac,
                              { color: palette.fg, opacity: 0.55 },
                            ]}>
                            {sample.cents}
                          </Text>
                        </Text>
                        <Text style={[styles.featureOct, { color: palette.kicker }]}>
                          {sample.octane} octane · sample
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.emptyText}>
                {stations.length === 0
                  ? `No live stations within ${radiusMiLabel(radius)} mi yet — try a wider radius or share your location.`
                  : `Stations are here, but no prices for ${
                      octane === 'premium' ? 'any premium octane' : `${octane} octane`
                    } yet.`}
              </Text>
              {stations.length > 0 ? (
                <Pressable style={styles.errorBtn} onPress={onManualRefreshPrices}>
                  <Text style={styles.errorBtnText}>Refresh prices</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListFooterComponent={
          <>
            {sortedStations.length > 0 && hiddenUnpriced > 0 ? (
              <Text style={styles.hiddenNote}>
                + {hiddenUnpriced} nearby station
                {hiddenUnpriced === 1 ? '' : 's'} without premium data yet
              </Text>
            ) : null}

            {/* Website footer — dark ink canvas, 4-column link layout */}
            <View style={styles.footer}>
              <View style={styles.footerCols}>
                <View style={styles.footerBrandCol}>
                  <View style={styles.footerBrandRow}>
                    <View style={styles.footerSquare} />
                    <Text style={styles.footerBrandText}>Pump</Text>
                  </View>
                  <Text style={styles.footerTag}>
                    Authoritative premium-octane pump prices with net-savings
                    math. Built for drivers who care which premium they're
                    buying.
                  </Text>
                </View>

                <View style={styles.footerCol}>
                  <Text style={styles.footerColTitle}>Product</Text>
                  <Text style={styles.footerColLink}>Pumps</Text>
                  <Text style={styles.footerColLink}>Atlas</Text>
                  <Text style={styles.footerColLink}>Report</Text>
                  <Text style={styles.footerColLink}>Garage</Text>
                </View>

                <View style={styles.footerCol}>
                  <Text style={styles.footerColTitle}>About</Text>
                  <Text style={styles.footerColLink}>Methodology</Text>
                  <Text style={styles.footerColLink}>Data sources</Text>
                  <Text style={styles.footerColLink}>Coverage</Text>
                  <Text style={styles.footerColLink}>Privacy</Text>
                </View>

                <View style={styles.footerCol}>
                  <Text style={styles.footerColTitle}>For drivers</Text>
                  <Text style={styles.footerColLink}>Sign in</Text>
                  <Text style={styles.footerColLink}>Favorites</Text>
                  <Text style={styles.footerColLink}>Price alerts</Text>
                  <Text style={styles.footerColLink}>Your garage</Text>
                </View>
              </View>

              <View style={styles.footerBar}>
                <Text style={styles.footerBarText}>© 2026 Pump · Editorial</Text>
                <View style={styles.footerBarRight}>
                  <Text style={styles.footerBarLink}>Privacy</Text>
                  <Text style={styles.footerBarLink}>Terms</Text>
                </View>
              </View>
            </View>
          </>
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

function makeStyles({ colors, fonts, space, radius }: Theme, width: number) {
  // Scale up toward the preview's clamp() maxes on wider screens.
  const heroTitleSize = width >= 900 ? 64 : width >= 600 ? 52 : 40;
  const heroTitleLine = Math.round(heroTitleSize * 1.05);
  const sectionTitleSize = width >= 600 ? 36 : 28;
  const featurePriceSize = width >= 900 ? 96 : width >= 600 ? 80 : 64;
  const featureBrandSize = width >= 900 ? 48 : width >= 600 ? 40 : 32;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    list: {
      paddingHorizontal: space.lg,
      paddingBottom: 0,
      gap: 20,
    },

    headerStack: {
      gap: 24,
      paddingTop: 0,
    },

    // Top nav strip — coral square + Pump + Sign in / Get started.
    // Escapes the list's lg horizontal padding via negative margin so the
    // bottom border runs edge-to-edge like the preview.
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: space.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.paperEdge,
      marginHorizontal: -space.lg,
      marginBottom: width >= 600 ? 24 : 8,
    },
    navBrand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    navSquare: {
      width: 18,
      height: 18,
      backgroundColor: colors.rust,
      borderRadius: 4,
    },
    navBrandText: {
      fontFamily: fonts.bodyBold,
      fontSize: 20,
      color: colors.ink,
      letterSpacing: -0.4,
    },
    navRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    navPillOutline: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.ink,
    },
    navPillOutlineText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.ink,
      letterSpacing: -0.1,
    },
    navPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 9999,
      backgroundColor: colors.ink,
    },
    navPillText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.bg,
      letterSpacing: -0.1,
    },

    // Hero grid — title-block left, station sheet right on widescreens
    heroGrid: {
      flexDirection: width >= 820 ? 'row' : 'column',
      gap: width >= 820 ? 56 : 28,
      alignItems: width >= 820 ? 'center' : 'stretch',
      paddingTop: width >= 600 ? 24 : 8,
    },

    // Title block
    hero: { gap: 18, flex: width >= 820 ? 1 : undefined },

    // Station sheet — stylized spreadsheet, runs flush-edge on narrow
    // screens, side-by-side on widescreens.
    sheet: {
      flex: width >= 820 ? 1 : undefined,
      backgroundColor: '#f8fafc',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({ boxShadow: '0 18px 40px rgba(24,29,38,0.08)' } as any)
        : null),
    },
    sheetBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: '#f5e9d4',
      borderBottomWidth: 1,
      borderBottomColor: colors.paperEdge,
    },
    sheetDot: { width: 9, height: 9, borderRadius: 50 },
    sheetFilename: {
      marginLeft: 6,
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: colors.inkFaint,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.paperEdge,
    },
    sheetRowHeader: { backgroundColor: '#e0e2e6' },
    sheetRowCheap: { backgroundColor: 'rgba(170,45,0,0.06)' },
    sheetRowEmpty: { justifyContent: 'center', paddingVertical: 24 },
    sheetEmptyText: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkFaint,
      fontStyle: 'italic',
    },
    sheetCellIx: {
      width: 28,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.inkFaint,
    },
    sheetCellName: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.ink,
    },
    sheetCellMi: {
      width: 56,
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
      textAlign: 'right',
    },
    sheetCellPrice: {
      width: 72,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.ink,
      textAlign: 'right',
    },
    sheetCellPriceCheap: { color: colors.rust },
    sheetCellHeader: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    kicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: colors.rust,
      letterSpacing: 0.1,
    },
    heroTitle: {
      fontFamily: fonts.display,
      fontSize: heroTitleSize,
      lineHeight: heroTitleLine,
      color: colors.ink,
      letterSpacing: -1.6,
      fontWeight: '600',
    },
    heroTitleEm: {
      // Approximate the preview's 4px-thick coral underline. RN doesn't
      // support text-underline-offset, so we set decorationColor to coral
      // and let the text sit a half-line above its baseline visually via
      // the inline element styling.
      color: colors.rust,
      textDecorationLine: 'underline',
      textDecorationColor: colors.rust,
    },
    lede: {
      fontFamily: fonts.body,
      fontSize: width >= 600 ? 19 : 16,
      lineHeight: width >= 600 ? 28 : 24,
      color: colors.inkSoft,
    },

    locCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: '#f8fafc',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      marginTop: 8,
    },
    locLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.rust,
      letterSpacing: 0.8,
      marginBottom: 2,
      textTransform: 'uppercase',
    },
    locValue: {
      fontFamily: fonts.bodyMedium,
      fontSize: 16,
      color: colors.ink,
    },
    gpsPill: {
      backgroundColor: colors.ink,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9999,
    },
    gpsPillText: {
      color: colors.bg,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    pressed: { opacity: 0.7 },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: '#f8fafc',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.ink,
    },

    // Section head — title + sub
    sectionHead: { gap: 8, marginTop: 8 },
    sectionHeadTitle: {
      fontFamily: fonts.display,
      fontSize: sectionTitleSize,
      lineHeight: sectionTitleSize * 1.1,
      color: colors.ink,
      letterSpacing: -1,
      fontWeight: '600',
    },
    sectionHeadSub: {
      fontFamily: fonts.body,
      fontSize: 17,
      lineHeight: 26,
      color: colors.inkSoft,
      maxWidth: 600,
    },

    // Segmented control — ink-outline pill, active = ink fill
    segWrap: { alignItems: 'flex-start' },
    seg: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.ink,
      borderRadius: 9999,
      overflow: 'hidden',
    },
    segCell: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: 'transparent',
    },
    segCellFirst: {},
    segCellLast: {},
    segCellActive: { backgroundColor: colors.ink },
    segText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.inkSoft,
      letterSpacing: -0.1,
    },
    segTextActive: { color: colors.bg },

    // Sort / radius row — inline text links
    linkRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 16,
      flexWrap: 'wrap',
    },
    linkRowLabel: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkFaint,
    },
    linkRowSpacer: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkFaint,
      marginLeft: 12,
    },
    linkText: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkSoft,
    },
    linkTextActive: {
      color: colors.ink,
      fontFamily: fonts.bodyBold,
    },

    // Feature card — full-bleed signature color
    feature: {
      borderRadius: 24,
      padding: width >= 720 ? 40 : 28,
      gap: 12,
    },
    featurePressed: { opacity: 0.92 },
    featureBody: {
      flexDirection: width >= 720 ? 'row' : 'column',
      gap: width >= 720 ? 32 : 20,
      alignItems: width >= 720 ? 'center' : 'stretch',
    },
    featureLeft: {
      flex: width >= 720 ? 1.4 : undefined,
      gap: 8,
    },
    featureRight: {
      flex: width >= 720 ? 1 : undefined,
      alignItems: width >= 720 ? 'flex-end' : 'flex-start',
      gap: 6,
    },
    featureKicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      letterSpacing: 0,
      opacity: 0.85,
    },
    featureBrand: {
      fontFamily: fonts.display,
      fontSize: featureBrandSize,
      lineHeight: featureBrandSize * 1.05,
      letterSpacing: -1.4,
      fontWeight: '600',
      marginTop: 4,
    },
    featureAddr: {
      fontFamily: fonts.body,
      fontSize: 16,
      lineHeight: 22,
      marginTop: 4,
    },
    featurePrice: {
      fontFamily: fonts.priceHeavy,
      fontSize: featurePriceSize,
      lineHeight: featurePriceSize * 0.95,
      letterSpacing: -featurePriceSize * 0.045,
      fontWeight: '700',
    },
    featurePriceFrac: {
      fontFamily: fonts.priceHeavy,
      fontSize: featurePriceSize * 0.5,
      fontWeight: '500',
    },
    featurePriceEmpty: {
      fontFamily: fonts.priceHeavy,
      fontSize: featurePriceSize * 0.5,
    },
    featureOct: {
      fontFamily: fonts.body,
      fontSize: 14,
      marginTop: 4,
      opacity: 0.85,
    },
    featureCta: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 9999,
      marginTop: 14,
    },
    featureCtaText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      letterSpacing: -0.1,
    },
    featureSavings: {
      borderTopWidth: 1,
      paddingTop: 16,
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    featureSavingsTag: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 9999,
    },
    featureSavingsTagText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 0,
    },
    featureSavingsHint: {
      fontFamily: fonts.body,
      fontSize: 14,
      flex: 1,
    },

    hiddenNote: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkFaint,
      textAlign: 'center',
      fontStyle: 'italic',
      paddingVertical: 24,
    },

    // Dark website footer — escapes list padding to go edge-to-edge.
    footer: {
      backgroundColor: colors.ink,
      paddingHorizontal: space.lg,
      paddingTop: width >= 600 ? 72 : 56,
      paddingBottom: 32,
      marginHorizontal: -space.lg,
      marginTop: 32,
    },
    footerCols: {
      flexDirection: width >= 720 ? 'row' : 'column',
      gap: width >= 720 ? 40 : 32,
      marginBottom: 48,
      flexWrap: 'wrap',
    },
    footerBrandCol: {
      flex: width >= 720 ? 2 : undefined,
      gap: 12,
      minWidth: 220,
    },
    footerBrandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    footerSquare: {
      width: 20,
      height: 20,
      backgroundColor: colors.rust,
      borderRadius: 4,
    },
    footerBrandText: {
      fontFamily: fonts.display,
      fontSize: 28,
      color: '#ffffff',
      letterSpacing: -0.7,
      fontWeight: '700',
    },
    footerTag: {
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 22,
      color: 'rgba(255,255,255,0.7)',
      maxWidth: 320,
      marginTop: 4,
    },
    footerCol: {
      flex: width >= 720 ? 1 : undefined,
      gap: 8,
      minWidth: 140,
    },
    footerColTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: '#ffffff',
      marginBottom: 4,
    },
    footerColLink: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: 'rgba(255,255,255,0.7)',
    },
    footerBar: {
      flexDirection: width >= 600 ? 'row' : 'column',
      justifyContent: 'space-between',
      alignItems: width >= 600 ? 'center' : 'flex-start',
      gap: 12,
      paddingTop: 24,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.15)',
    },
    footerBarText: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: 'rgba(255,255,255,0.5)',
    },
    footerBarRight: {
      flexDirection: 'row',
      gap: 18,
    },
    footerBarLink: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: 'rgba(255,255,255,0.7)',
    },

    emptyWrap: { paddingHorizontal: 0, paddingVertical: 20, gap: 16 },
    emptyKicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.inkFaint,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    emptyText: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkFaint,
      textAlign: 'center',
      fontStyle: 'italic',
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
      backgroundColor: colors.ink,
      borderRadius: 9999,
    },
    errorBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: colors.bg,
    },
  });
}
