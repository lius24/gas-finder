// Ferrari "Edizione Corsa" Pumps view — cinematic near-black canvas,
// modest-weight white display type, Rosso Corsa used as scarce voltage,
// editorial telemetry strip, dark cards with red accent on the cheapest.
// Ports public/preview/ferrari.html into React Native Web.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PumpsData } from '@/hooks/use-pumps-data';
import { formatSavingsRange } from '@/lib/decision-math';
import { formatDistance } from '@/lib/geo';
import { staleLabel } from '@/lib/staleness';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

// Sample stations shown in the empty state so the cinema-card panels are
// visible even before live data lands (GPS denied, nothing in range).
// Placeholders only — replaced by real data once stations load.
type SampleStation = {
  rank: string;
  badge: 'cheapest' | 'closest' | null;
  brand: string;
  addr: string;
  mi: string;
  age: string;
  stale: boolean;
  dollars: string;
  cents: string;
  octane: string;
  savings: { verb: 'SAVE' | 'COSTS'; amount: string } | null;
};
const SAMPLE_STATIONS: SampleStation[] = [
  { rank: '01', badge: 'cheapest', brand: 'Sunoco', addr: '125 Hoosick St, Troy, NY', mi: '2.0 MI', age: '4H AGO', stale: false, dollars: '5', cents: '30', octane: '93', savings: { verb: 'SAVE', amount: '$1.27 – $1.93 / fill-up' } },
  { rank: '02', badge: null, brand: "Stewart's Shops", addr: '110 Hoosick St, Troy, NY', mi: '1.4 MI', age: '11H AGO', stale: false, dollars: '5', cents: '56', octane: '91', savings: { verb: 'SAVE', amount: '$0.80 – $1.20 / fill-up' } },
  { rank: '03', badge: 'closest', brand: "Stewart's Shops", addr: '8 Vandenburgh Ave, Troy, NY', mi: '0.5 MI', age: '3D AGO', stale: false, dollars: '5', cents: '66', octane: '91', savings: null },
  { rank: '04', badge: null, brand: 'Speedway', addr: '175 Hoosick St, Troy, NY', mi: '2.1 MI', age: '3D OLD · STALE', stale: true, dollars: '5', cents: '40', octane: '93', savings: { verb: 'SAVE', amount: '$0.94 – $1.42 / fill-up' } },
  { rank: '05', badge: null, brand: 'Gulf', addr: '95 Hill St, Troy, NY', mi: '1.8 MI', age: '18H AGO', stale: false, dollars: '5', cents: '40', octane: '93', savings: { verb: 'COSTS', amount: '$0.21 – $0.31 extra' } },
  { rank: '06', badge: null, brand: 'Cumberland Farms', addr: '625 Pawling Ave, Troy, NY', mi: '3.4 MI', age: '1D AGO', stale: false, dollars: '5', cents: '50', octane: '93', savings: { verb: 'SAVE', amount: '$0.49 – $0.74 / fill-up' } },
];

// Ferrari grid layout constants — shared by the component (column-count
// math) and makeStyles (gap/padding) so the two never drift. Mirror the
// preview's CSS: `gap: var(--md)` = 32, section padding `var(--md)` = 32,
// `minmax(360px, …)` = 360. Phone keeps a tighter 16px gutter.
const FERRARI_GRID_GAP = 32;
const FERRARI_CARD_MIN = 360;
const ferrariGridPad = (w: number) => (w >= 600 ? 32 : 16);

export function FerrariPumpsView({ data }: { data: PumpsData }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme, width), [theme, width]);
  const { colors } = theme;

  // Station grid layout — fluid auto-fill, reproducing the preview's
  // `grid-template-columns: repeat(auto-fill, minmax(360px, 1fr))`
  // (public/preview/ferrari.html). Full-bleed: no max-width cap, so the
  // column count grows with the window the same way the preview does —
  // 3 columns near 1280px, 4 near 1920px, more on wider monitors. Cards
  // get an explicit pixel width because RN-Web's FlatList numColumns
  // renders unreliably (overlapping cards).
  const GRID_GAP = FERRARI_GRID_GAP;
  const GRID_PAD = ferrariGridPad(width);
  const innerW = width - GRID_PAD * 2;
  // auto-fill column count: how many CARD_MIN-wide tracks fit, gaps included.
  const columns = Math.max(
    1,
    Math.floor((innerW + GRID_GAP) / (FERRARI_CARD_MIN + GRID_GAP)),
  );
  // Each track is 1fr → cards stretch to fill the row evenly.
  const cardW =
    columns === 1
      ? innerW
      : Math.floor((innerW - GRID_GAP * (columns - 1)) / columns);

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

  // Telemetry — three big cinema gauges
  const tStations = stations.length;
  const tPriced = annotatedStations.filter((s) => s.price_cents !== null).length;
  const cheapestStation =
    cheapestId != null ? stations.find((s) => s.id === cheapestId) ?? null : null;
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

  // Normalize real stations + samples into one card model so the grid
  // renders identically for both.
  type CardData = {
    key: string;
    rank: string;
    badge: 'cheapest' | 'closest' | null;
    brand: string;
    addr: string;
    metaMi: string;
    metaAge: string | null;
    stale: boolean;
    price: { d: string; c: string } | null;
    octane: string;
    savings: { verb: 'SAVE' | 'COSTS'; amount: string } | null;
    href: { pathname: '/station/[id]'; params: { id: string; seed: string } } | null;
  };

  const hasData = sortedStations.length > 0;

  const cards: CardData[] = hasData
    ? sortedStations.map((item, index) => {
        const savingsText = item.savings ? formatSavingsRange(item.savings) : null;
        const positive = item.savings ? item.savings.centralDollars > 0 : false;
        const stale = staleLabel(item.observed_at);
        return {
          key: item.id,
          rank: (index + 1).toString().padStart(2, '0'),
          badge:
            item.id === cheapestId
              ? 'cheapest'
              : item.id === closestId
                ? 'closest'
                : null,
          brand: item.brand ?? item.name,
          addr: item.address,
          metaMi: formatDistance(item.distance_meters),
          metaAge: stale,
          stale: !!stale,
          price:
            item.price_cents !== null
              ? {
                  d: String(Math.floor(item.price_cents / 100)),
                  c: (item.price_cents % 100).toString().padStart(2, '0'),
                }
              : null,
          octane: item.octane != null ? String(item.octane) : '—',
          savings: savingsText
            ? {
                verb: positive ? 'SAVE' : 'COSTS',
                amount: savingsText.replace('Save ', '').replace('Costs ', ''),
              }
            : null,
          href: {
            pathname: '/station/[id]',
            params: { id: item.id, seed: JSON.stringify(item) },
          },
        };
      })
    : SAMPLE_STATIONS.map((s) => ({
        key: s.rank,
        rank: s.rank,
        badge: s.badge,
        brand: s.brand,
        addr: s.addr,
        metaMi: s.mi,
        metaAge: s.age,
        stale: s.stale,
        price: { d: s.dollars, c: s.cents },
        octane: s.octane,
        savings: s.savings,
        href: null,
      }));

  const renderCard = (cd: CardData) => {
    const inner = (
      <>
        <View style={styles.cardTop}>
          <Text style={styles.cardRank}>
            <Text
              style={[
                styles.cardRankNum,
                cd.badge === 'cheapest' && styles.cardRankNumCheapest,
              ]}>
              {cd.rank}
            </Text>
            {cd.badge === 'cheapest'
              ? '  ·  CHEAPEST'
              : cd.badge === 'closest'
                ? '  ·  BASELINE'
                : ''}
          </Text>
          {cd.badge === 'cheapest' ? (
            <View style={styles.cardChip}>
              <Text style={styles.cardChipText}>★ BEST PRICE</Text>
            </View>
          ) : cd.badge === 'closest' ? (
            <View style={[styles.cardChip, styles.cardChipClosest]}>
              <Text style={styles.cardChipText}>⌖ CLOSEST</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.cardBrand} numberOfLines={1}>
          {cd.brand}
        </Text>
        <Text style={styles.cardAddr} numberOfLines={1}>
          {cd.addr}
        </Text>

        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>{cd.metaMi}</Text>
          <View style={styles.cardMetaDot} />
          <Text style={styles.cardMetaText}>LIVE · PLACES</Text>
          {cd.metaAge ? (
            <>
              <View style={styles.cardMetaDot} />
              <Text
                style={[styles.cardMetaText, cd.stale && styles.cardMetaStale]}>
                {cd.metaAge}
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.cardPriceRow}>
          {cd.price ? (
            <Text style={styles.cardPrice}>
              ${cd.price.d}.
              <Text style={styles.cardPriceFrac}>{cd.price.c}</Text>
            </Text>
          ) : (
            <Text style={styles.cardPriceEmpty}>—.—</Text>
          )}
          <View style={styles.cardOctRight}>
            <Text style={styles.cardOctNum}>{cd.octane}</Text>
            <Text style={styles.cardOctLabel}>OCTANE</Text>
          </View>
        </View>

        {cd.savings ? (
          <View style={styles.savingsRow}>
            <Text
              style={[
                styles.savingsVerb,
                cd.savings.verb === 'COSTS' && styles.savingsVerbCost,
              ]}>
              {cd.savings.verb}
            </Text>
            <Text style={styles.savingsAmt} numberOfLines={1}>
              {cd.savings.amount}
            </Text>
            <Text style={styles.savingsGo}>DIRECTIONS →</Text>
          </View>
        ) : null}
      </>
    );

    if (cd.href) {
      return (
        <Link key={cd.key} href={cd.href} asChild>
          <Pressable
            style={({ pressed }) => [
              styles.card,
              { width: cardW },
              cd.badge === 'cheapest' && styles.cardCheapest,
              pressed && styles.cardPressed,
            ]}>
            {inner}
          </Pressable>
        </Link>
      );
    }
    return (
      <View
        key={cd.key}
        style={[
          styles.card,
          { width: cardW },
          cd.badge === 'cheapest' && styles.cardCheapest,
        ]}>
        {inner}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.rust}
          />
        }>
        <View style={styles.column}>
          <View style={styles.headerStack}>
            {/* Cinema hero — radial red gradient at top-right per preview */}
            <View style={styles.cinema}>
              <View style={styles.heroEyebrow}>
                <View style={styles.heroEyebrowRule} />
                <Text style={styles.heroEyebrowText}>
                  EDIZIONE CORSA · PREMIUM FUEL INTELLIGENCE
                </Text>
              </View>
              <Text style={styles.heroTitle}>
                Find a price{'\n'}worth <Text style={styles.heroTitleEm}>driving</Text> for.
              </Text>
              <Text style={styles.heroLede}>
                Authoritative, pump-feed octane prices with net-savings math built in.
                Premium pumps near you, ranked by what your tank actually costs.
              </Text>

              {/* Telemetry — three cinema gauges */}
              <View style={styles.telemetry}>
                <View style={styles.telCell}>
                  <Text style={styles.telNum}>
                    {tPriced}
                    <Text style={styles.telNumUnit}>/{tStations}</Text>
                  </Text>
                  <Text style={styles.telLabel}>STATIONS WITH PREMIUM</Text>
                </View>
                <View style={[styles.telCell, styles.telCellMid]}>
                  <Text style={[styles.telNum, styles.telNumAccent]}>{cheapestPriceLabel}</Text>
                  <Text style={styles.telLabel}>CHEAPEST · {radiusMiLabel(radius)} MI</Text>
                </View>
                <View style={[styles.telCell, styles.telCellLast]}>
                  <Text style={styles.telNum}>{topSavingsLabel}</Text>
                  <Text style={styles.telLabel}>TOP NET SAVINGS</Text>
                </View>
              </View>
            </View>

            {/* Location pill */}
            <View style={styles.editorial}>
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

              {/* Section head: title left + meta right */}
              <View style={styles.sectionHead}>
                <Text style={styles.sectionHeadTitle}>Premium pumps near you</Text>
                <Text style={styles.sectionHeadMeta}>
                  SHOWING <Text style={styles.sectionHeadMetaStrong}>{tPriced}</Text> · WITHIN{' '}
                  <Text style={styles.sectionHeadMetaStrong}>{radiusMiLabel(radius)} MI</Text>
                </Text>
              </View>

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
                  <View style={styles.octCellPremAccent} />
                  <Text
                    style={[
                      styles.octNum,
                      styles.octNumPrem,
                      octane === 'premium' && styles.octNumPremActive,
                    ]}>
                    91+
                  </Text>
                  <Text
                    style={[
                      styles.octSub,
                      styles.octSubPrem,
                      octane === 'premium' && styles.octSubPremActive,
                    ]}>
                    ANY PREMIUM
                  </Text>
                </Pressable>
              </View>

              {/* Sort + radius controls */}
              <View style={styles.controlsRow}>
                <View style={styles.controlsGroup}>
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
                </View>
                <View style={[styles.controlsGroup, styles.controlsGroupRight]}>
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
          </View>

          {/* Station grid — computed-width flex-wrap (replaces the buggy
              FlatList numColumns grid). Renders real cards when data has
              loaded, sample cinema cards otherwise (incl. when GPS is
              denied — the samples preview the layout). */}
          {!loading ? (
            <View style={styles.grid}>{cards.map(renderCard)}</View>
          ) : null}

          {/* Empty-state note + refresh */}
          {!loading && !error && !hasData ? (
            <Text style={styles.emptyText}>
              {stations.length === 0
                ? `No live stations within ${radiusMiLabel(radius)} mi yet — widen the radius or share your location.`
                : `Stations are here, but no prices for ${
                    octane === 'premium' ? 'any premium octane' : `${octane} octane`
                  } yet.`}
            </Text>
          ) : null}
          {!loading && !error && !hasData && stations.length > 0 ? (
            <View style={styles.refreshWrap}>
              <Pressable style={styles.errorBtn} onPress={onManualRefreshPrices}>
                <Text style={styles.errorBtnText}>REFRESH PRICES</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Hidden-unpriced note */}
          {hasData && hiddenUnpriced > 0 ? (
            <Text style={styles.hiddenNote}>
              + {hiddenUnpriced} nearby station
              {hiddenUnpriced === 1 ? '' : 's'} without premium data yet
            </Text>
          ) : null}

          {/* Livery band — only with real data */}
          {hasData ? (
            <View style={styles.livery}>
              <Text style={styles.liveryTitle}>One brand voltage.</Text>
              <Text style={styles.liverySub}>
                Rosso Corsa marks the moments that matter — the cheapest premium,
                the brand mark, the call to drive.
              </Text>
            </View>
          ) : null}

          {/* Website footer — brand mark + link columns + copyright */}
          <View style={styles.footer}>
            <View style={styles.footerBrandRow}>
              <View style={styles.footerBrand}>
                <View style={styles.navHorse} />
                <Text style={styles.footerBrandText}>PUMP · CORSA</Text>
              </View>
              <View style={styles.footerLinks}>
                <Text style={styles.footerLink}>ABOUT</Text>
                <Text style={styles.footerLink}>METHODOLOGY</Text>
                <Text style={styles.footerLink}>PRICING DATA</Text>
                <Text style={styles.footerLink}>PRIVACY</Text>
              </View>
            </View>
            <View style={styles.footerDivider} />
            <Text style={styles.footerCopy}>
              © 2026 · EDIZIONE CORSA · BUILT FOR DRIVERS WHO CARE WHICH PREMIUM
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function radiusMiLabel(m: number): string {
  if (m === 1609) return '1';
  if (m === 4828) return '3';
  if (m === 8047) return '5';
  return '10';
}

function makeStyles({ colors, fonts, space }: Theme, width: number) {
  // Responsive scaling — phone uses preview's mobile clamp floor, tablet+
  // scales up toward the preview's max sizes.
  const heroTitleSize = width >= 900 ? 96 : width >= 600 ? 72 : 56;
  const heroTitleLine = Math.round(heroTitleSize * 1.02);
  const telNumSize = width >= 900 ? 72 : width >= 600 ? 56 : 44;
  const cardPriceSize = width >= 600 ? 56 : 48;
  const cardBrandSize = width >= 600 ? 28 : 24;

  const GRID_PAD = ferrariGridPad(width);

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

    // ScrollView content. Full-bleed — the preview is an edge-to-edge
    // marketing page with no centered max-width container.
    scrollContent: { backgroundColor: colors.bg },
    column: { width: '100%' },

    // Station grid — fluid flex-wrap; each card gets an explicit pixel
    // width. 32px gutter matches the preview's `gap: var(--md)`.
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: FERRARI_GRID_GAP,
      paddingHorizontal: GRID_PAD,
      paddingTop: 4,
      paddingBottom: 8,
    },
    refreshWrap: { alignItems: 'center', paddingVertical: 16 },

    headerStack: {},

    // Brand bar — nav strip above the cinema hero
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.lg,
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: colors.paperEdge,
      backgroundColor: colors.bg,
    },
    navBrand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    navHorse: {
      width: 12,
      height: 12,
      backgroundColor: colors.rust,
      transform: [{ rotate: '45deg' }],
    },
    navBrandText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: colors.ink,
      letterSpacing: 0.5,
    },
    navRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    navRightText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1.2,
    },
    navRightDot: {
      color: colors.inkFaint,
      opacity: 0.4,
      fontSize: 11,
    },

    // Cinema hero — full-bleed near-black with massive type. Mimics the
    // preview's --super (128px) top padding via a generous paddingTop that
    // scales down on phones. The red radial-gradient at top-right is the
    // preview's voltage cue — RN-web passes web CSS through, so we set
    // backgroundImage directly. Native still falls back to the solid bg.
    cinema: {
      paddingHorizontal: GRID_PAD,
      paddingTop: width >= 600 ? 72 : 40,
      paddingBottom: width >= 600 ? 56 : 36,
      borderBottomWidth: 1,
      borderBottomColor: colors.paperEdge,
      backgroundColor: colors.bg,
      ...(Platform.OS === 'web'
        ? ({
            // Two radials: warm red at the top-right (the brand voltage),
            // a subtle white wash bottom-left (the cinema spotlight). Both
            // sit ON TOP of the canvas color so the hero feels lit, not flat.
            backgroundImage:
              'radial-gradient(1200px 600px at 90% -20%, rgba(218,41,28,0.28), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(255,255,255,0.04), transparent 60%)',
          } as any)
        : null),
    },

    heroEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24,
    },
    heroEyebrowRule: { width: 32, height: 1, backgroundColor: colors.rust },
    heroEyebrowText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.rust,
      letterSpacing: 1.4,
    },

    heroTitle: {
      fontFamily: fonts.display,
      fontSize: heroTitleSize,
      lineHeight: heroTitleLine,
      color: colors.ink,
      letterSpacing: -2.6,
      fontWeight: '500',
      marginBottom: 0,
    },
    heroTitleEm: {
      fontFamily: fonts.displayItalic,
      fontStyle: 'italic',
      color: colors.inkSoft,
      letterSpacing: -2.2,
      fontWeight: '400',
    },
    heroLede: {
      fontFamily: fonts.body,
      fontSize: width >= 600 ? 18 : 16,
      lineHeight: width >= 600 ? 28 : 24,
      color: colors.inkFaint,
      marginTop: 24,
      maxWidth: 560,
    },

    // Telemetry — three big numbers in cinema-gauge style
    telemetry: {
      flexDirection: width >= 600 ? 'row' : 'column',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.paperEdge,
      marginTop: width >= 600 ? 64 : 40,
    },
    telCell: {
      flex: 1,
      paddingVertical: width >= 600 ? 24 : 18,
      paddingRight: width >= 600 ? 24 : 0,
      borderRightWidth: width >= 600 ? 1 : 0,
      borderRightColor: colors.paperEdge,
      borderBottomWidth: width >= 600 ? 0 : 1,
      borderBottomColor: colors.paperEdge,
    },
    telCellMid: {
      paddingLeft: width >= 600 ? 24 : 0,
    },
    telCellLast: {
      paddingLeft: width >= 600 ? 24 : 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
    },
    telNum: {
      fontFamily: fonts.priceHeavy,
      fontSize: telNumSize,
      lineHeight: telNumSize,
      letterSpacing: -1.6,
      color: colors.ink,
      fontWeight: '700',
    },
    telNumAccent: { color: colors.rust },
    telNumUnit: {
      color: colors.inkFaint,
      fontWeight: '300',
      letterSpacing: -0.4,
    },
    telLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1.1,
      marginTop: 16,
    },

    // Editorial wrapper — below the cinema
    editorial: {
      paddingHorizontal: GRID_PAD,
      paddingTop: width >= 600 ? 56 : 32,
      paddingBottom: 8,
    },

    locPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 0,
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
      backgroundColor: colors.rust,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    gpsPillText: {
      color: colors.onRust,
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
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      marginBottom: 32,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.ink,
    },

    // Section head — title left, meta right
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 16,
      marginBottom: 24,
      flexWrap: 'wrap',
    },
    sectionHeadTitle: {
      fontFamily: fonts.display,
      fontSize: width >= 600 ? 36 : 28,
      lineHeight: width >= 600 ? 40 : 32,
      color: colors.ink,
      letterSpacing: -0.72,
      fontWeight: '500',
      flexShrink: 1,
    },
    sectionHeadMeta: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1.1,
    },
    sectionHeadMetaStrong: { color: colors.ink },

    // Octane bar — full-width segmented, premium gets red side-accent
    octaneBar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.paperEdge,
      marginBottom: 24,
    },
    octCell: {
      flex: 1,
      paddingVertical: 20,
      paddingHorizontal: 8,
      alignItems: 'center',
      borderRightWidth: 1,
      borderRightColor: colors.paperEdge,
    },
    octCellActive: { backgroundColor: colors.ink },
    octNum: {
      fontFamily: fonts.priceHeavy,
      fontSize: 28,
      lineHeight: 28,
      color: colors.inkFaint,
      letterSpacing: -0.5,
      fontWeight: '700',
    },
    octNumActive: { color: colors.bg },
    octSub: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.inkFaint,
      letterSpacing: 1.1,
      marginTop: 6,
    },
    octSubActive: { color: colors.bg, opacity: 0.55 },

    octCellPrem: {
      flex: 1.4,
      borderRightWidth: 0,
      position: 'relative',
    },
    octCellPremActive: { backgroundColor: colors.rust },
    octCellPremAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      backgroundColor: colors.rust,
    },
    octNumPrem: { color: colors.rust },
    octNumPremActive: { color: colors.ink },
    octSubPrem: { color: colors.rust, opacity: 0.95 },
    octSubPremActive: { color: colors.ink, opacity: 0.85 },

    // Controls — sort left, radius right
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 16,
      paddingBottom: 24,
      marginBottom: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.paperEdge,
    },
    controlsGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    controlsGroupRight: width >= 600 ? { marginLeft: 'auto' } : {},
    controlsLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1.1,
      marginRight: 4,
    },
    pill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      backgroundColor: 'transparent',
    },
    pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    pillText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.inkFaint,
      letterSpacing: 1.4,
    },
    pillTextActive: { color: colors.bg },

    // Cinema card — width is set inline (computed per column count); the
    // grid container handles gaps, so the card carries no margin.
    card: {
      backgroundColor: '#1f1f1f',
      borderWidth: 1,
      borderColor: colors.paperEdge,
      padding: 24,
      gap: 12,
    },
    cardCheapest: { borderColor: colors.rust },
    cardPressed: { opacity: 0.85 },

    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    cardRank: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.inkFaint,
      letterSpacing: 1.4,
    },
    cardRankNum: { color: colors.ink },
    cardRankNumCheapest: { color: colors.rust },
    cardChip: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      backgroundColor: colors.rust,
    },
    cardChipClosest: { backgroundColor: colors.paperEdge },
    cardChipText: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.onRust,
      letterSpacing: 1.4,
    },

    cardBrand: {
      fontFamily: fonts.display,
      fontSize: cardBrandSize,
      lineHeight: cardBrandSize * 1.1,
      color: colors.ink,
      letterSpacing: -0.56,
      fontWeight: '500',
    },
    cardAddr: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkFaint,
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    cardMetaText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1.1,
    },
    cardMetaStale: { color: '#f4b400' },
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
      paddingTop: 16,
      marginTop: 4,
    },
    cardPrice: {
      fontFamily: fonts.priceHeavy,
      fontSize: cardPriceSize,
      lineHeight: cardPriceSize * 0.95,
      color: colors.ink,
      letterSpacing: -1.6,
      fontWeight: '700',
    },
    cardPriceFrac: { fontSize: cardPriceSize / 2, color: colors.inkFaint },
    cardPriceEmpty: {
      fontFamily: fonts.priceHeavy,
      fontSize: 28,
      color: colors.inkFaint,
      letterSpacing: 1,
    },
    cardOctRight: { alignItems: 'flex-end' },
    cardOctNum: {
      fontFamily: fonts.priceHeavy,
      fontSize: 22,
      color: colors.rust,
      letterSpacing: -0.4,
      fontWeight: '700',
    },
    cardOctLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.inkFaint,
      letterSpacing: 1.1,
      marginTop: 2,
    },

    savingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.paperEdge,
      paddingTop: 16,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    savingsVerb: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.good,
      letterSpacing: 1.4,
    },
    savingsVerbCost: { color: colors.danger },
    savingsAmt: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.ink,
      flex: 1,
    },
    savingsGo: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.ink,
      letterSpacing: 1.4,
    },

    hiddenNote: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkFaint,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 24,
      marginBottom: 24,
      paddingHorizontal: space.lg,
    },

    // Livery — the brand's voltage moment
    livery: {
      backgroundColor: colors.rust,
      paddingVertical: width >= 600 ? 56 : 40,
      paddingHorizontal: space.lg,
      alignItems: 'center',
      marginTop: 16,
    },
    liveryTitle: {
      fontFamily: fonts.display,
      fontSize: width >= 600 ? 32 : 26,
      lineHeight: width >= 600 ? 36 : 30,
      color: colors.onRust,
      letterSpacing: -0.64,
      fontWeight: '500',
      textAlign: 'center',
    },
    liverySub: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.onRust,
      opacity: 0.92,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 480,
    },

    // Website footer — brand row + link columns + copyright
    footer: {
      paddingHorizontal: GRID_PAD,
      paddingTop: width >= 600 ? 64 : 48,
      paddingBottom: 32,
      borderTopWidth: 1,
      borderTopColor: colors.paperEdge,
      backgroundColor: colors.bg,
    },
    footerBrandRow: {
      flexDirection: width >= 700 ? 'row' : 'column',
      justifyContent: 'space-between',
      alignItems: width >= 700 ? 'center' : 'flex-start',
      gap: 24,
    },
    footerBrand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    footerBrandText: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: colors.ink,
      letterSpacing: 0.5,
    },
    footerLinks: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 24,
    },
    footerLink: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1.2,
    },
    footerDivider: {
      height: 1,
      backgroundColor: colors.paperEdge,
      marginTop: 32,
      marginBottom: 16,
    },
    footerCopy: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1.2,
    },

    emptyText: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkFaint,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 12,
      paddingHorizontal: space.lg,
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
