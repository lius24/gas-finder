import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OctaneSelector } from '@/components/octane-selector';
import { RadiusSelector } from '@/components/radius-selector';
import { StationCard } from '@/components/station-card';
import { useAuth } from '@/lib/auth';
import { annotateWithSavings, type AnnotatedStation } from '@/lib/decision-math';
import { listFavoriteIds } from '@/lib/favorites';
import {
  DEFAULT_OCTANE,
  DEFAULT_RADIUS_METERS,
  getPreferredOctane,
  getPreferredRadius,
  getPreferredSort,
  getRecentSearches,
  pushRecentSearch,
  setPreferredOctane,
  setPreferredRadius,
  setPreferredSort,
  type RadiusMeters,
  type RecentLocation,
  type SortKey,
} from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { octanesFor, type OctaneSelection, type StationWithPrice } from '@/lib/types';

type Coords = { latitude: number; longitude: number };

function formatLocationLabel(place: Location.LocationGeocodedAddress | null): string {
  if (!place) return '';
  const city = place.city ?? place.subregion ?? place.district ?? null;
  const region = place.region ?? null;
  if (city && region) return `${city}, ${region}`;
  return city ?? region ?? '';
}

export default function ListScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const { session } = useAuth();
  const [octane, setOctane] = useState<OctaneSelection>(DEFAULT_OCTANE);
  const [radius, setRadius] = useState<RadiusMeters>(DEFAULT_RADIUS_METERS);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [coords, setCoords] = useState<Coords | null>(null);
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(true);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<RecentLocation[]>([]);
  const [stations, setStations] = useState<StationWithPrice[]>([]);
  const [sort, setSort] = useState<SortKey>('cheapest');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const annotatedStations = useMemo<AnnotatedStation[]>(
    () => annotateWithSavings(stations, octane),
    [stations, octane],
  );

  // Unpriced stations are noise on every tab — the user came to find a
  // *price*, not to confirm a station exists. Hide them but surface a
  // single footer line "+ N nearby stations without prices yet" so the
  // count is still visible. The all-stations-unpriced empty state below
  // still fires (it inspects the unfiltered list).
  const hiddenUnpriced = useMemo(
    () => annotatedStations.filter((s) => s.price_cents === null).length,
    [annotatedStations],
  );

  const visibleAnnotated = useMemo<AnnotatedStation[]>(
    () => annotatedStations.filter((s) => s.price_cents !== null),
    [annotatedStations],
  );

  const sortedStations = useMemo(() => {
    const copy = [...visibleAnnotated];
    copy.sort((a, b) => {
      if (sort === 'cheapest') {
        const ap = a.price_cents;
        const bp = b.price_cents;
        if (ap === null && bp === null) return a.distance_meters - b.distance_meters;
        if (ap === null) return 1;
        if (bp === null) return -1;
        return ap - bp;
      }
      return a.distance_meters - b.distance_meters;
    });
    return copy;
  }, [visibleAnnotated, sort]);

  const cheapestId = useMemo(() => {
    const priced = stations.filter((s) => s.price_cents !== null);
    if (priced.length === 0) return null;
    return priced.reduce((min, s) =>
      (s.price_cents as number) < (min.price_cents as number) ? s : min,
    ).id;
  }, [stations]);

  const closestId = useMemo(() => {
    if (stations.length === 0) return null;
    return stations.reduce((min, s) =>
      s.distance_meters < min.distance_meters ? s : min,
    ).id;
  }, [stations]);

  const scrollY = useSharedValue(0);
  // V0 — the FlatList viewport when the toolbar is fully expanded. Captured
  // statically (the *minimum* observed onLayout height) so the footer math
  // doesn't react to its own layout effect, which otherwise creates a JS↔UI
  // feedback loop and makes the list shake on scroll-up.
  const v0 = useSharedValue(0);
  // Fallback card-height estimate, used only until real heights are measured
  // via onLayout. The estimate is generous so the initial footer is large
  // enough that the toolbar can fully collapse even before measurements
  // settle (under-estimating would leave the user unable to scroll).
  const ESTIMATED_CARD_HEIGHT = 110;
  const DIVIDER_HEIGHT = 30;
  const itemsHeight = useSharedValue(0);
  // Per-card height measurements. Keyed by station id so virtualization
  // (cards unmounting while off-screen) doesn't wipe the values. Sum of
  // these is the true items-height the footer formula needs.
  const cardHeightsRef = useRef(new Map<string, number>());
  const [measuredItemsHeight, setMeasuredItemsHeight] = useState(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Reset measurements when the station list changes (different octane,
  // refresh, etc.). Otherwise we'd keep stale heights for removed ids and
  // miss heights for new ones until they re-render.
  useEffect(() => {
    cardHeightsRef.current.clear();
    setMeasuredItemsHeight(0);
  }, [stations]);

  // Push items height into the worklet. Prefer the measured sum; fall back
  // to the estimate for the brief interval before cards have laid out.
  useEffect(() => {
    itemsHeight.value =
      measuredItemsHeight > 0
        ? measuredItemsHeight
        : sortedStations.length * ESTIMATED_CARD_HEIGHT;
  }, [measuredItemsHeight, sortedStations.length, itemsHeight]);

  const handleCardLayout = useCallback((id: string, h: number) => {
    const prev = cardHeightsRef.current.get(id);
    if (prev === h) return;
    cardHeightsRef.current.set(id, h);
    let total = 0;
    cardHeightsRef.current.forEach((v) => {
      total += v;
    });
    setMeasuredItemsHeight(total);
  }, []);

  // Sum of the animated height changes across the toolbar, from p=0 to p=1.
  // Must match exactly, otherwise viewport grows at a different rate than the
  // header spacer and the user can't reach scrollY=THRESHOLD before maxScroll
  // clamps short — i.e. the toolbar visually can't fully fold. Recents row
  // only contributes when it has content (height interpolates to 0 either
  // way, but its starting height is conditional).
  const recentsHasContent = recents.length > 0;
  const COLLAPSE_AMOUNT = 92 + 56 + (recentsHasContent ? 58 : 0) + 70 - 30;
  // SCROLL_THRESHOLD must equal COLLAPSE_AMOUNT so the spacer (rate 1) and
  // the viewport (rate COLLAPSE/THRESHOLD) grow at matching rates — keeps
  // contentSize − viewport constant, which is what removes the shake.
  const SCROLL_THRESHOLD = COLLAPSE_AMOUNT;
  const FOOTER_BASE = 16;

  // Single 0..1 progress drives every collapse animation. Driven directly
  // from raw scrollY — the in-list spacers (header + footer) absorb the
  // freed/required vertical space so iOS doesn't clamp scrollY back.
  const progress = useDerivedValue(() =>
    interpolate(scrollY.value, [0, SCROLL_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  );

  const brandStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [92, 0]),
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));

  const searchStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [56, 0]),
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));

  const recentsStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [recentsHasContent ? 58 : 0, 0]),
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));

  // Radius compacts to a single readout chip when scrolled, instead of fully
  // hiding — the user can still see what radius is in effect at all times.
  const radiusExpandedStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [70, 0]),
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  const radiusChipStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, 30]),
    opacity: interpolate(progress.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Header spacer grows 1:1 with raw scrollY (capped at SCROLL_THRESHOLD) so
  // the divider+cards rise with the filter as it folds — net screen Y of
  // item 1 ends up exactly under the collapsed toolbar bottom at scrollY=90.
  // Past the threshold the spacer caps, so further scroll moves items at
  // 1:1 (normal long-list behavior). Critically, this is driven by scrollY
  // not progress, so the response is instantaneous and doesn't depend on
  // any layout-derived value — no shake feedback loop.
  const headerSpacerStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [0, SCROLL_THRESHOLD],
      [0, SCROLL_THRESHOLD],
      Extrapolation.CLAMP,
    ),
  }));

  // Footer is a *static* pad: max(FOOTER_BASE, V0 + COLLAPSE_AMOUNT − inner).
  // This sizes the content so maxScrollY = COLLAPSE_AMOUNT exactly — the
  // user scrolls 0→COLLAPSE_AMOUNT, the toolbar fully collapses on the way,
  // and at the latch point the divider is flush against the collapsed
  // toolbar with the cards just below it. No further scroll past that
  // because there are no more cards to reveal — the collapsed toolbar
  // becomes the top edge of the list.
  // For long lists (inner > V0 + COLLAPSE_AMOUNT − FOOTER_BASE) the formula
  // clamps to FOOTER_BASE and scroll runs naturally past the latch since
  // there's real content underneath.
  const footerStyle = useAnimatedStyle(() => {
    if (v0.value <= 0) return { height: FOOTER_BASE };
    const inner = itemsHeight.value + DIVIDER_HEIGHT;
    return {
      height: Math.max(FOOTER_BASE, v0.value + COLLAPSE_AMOUNT - inner),
    };
  });

  const fetchNearby = useCallback(
    async (
      lat: number,
      lon: number,
      selection: OctaneSelection,
      radiusVal: RadiusMeters,
    ) => {
      setError(null);

      // The /nearby edge function takes one octane. For "any premium" we
      // fan out to 91/93/94 in parallel and merge by station_id — each
      // station's PREMIUM from Google Places maps to exactly one of those
      // buckets, so for any given station only one of the three calls
      // returns a non-null price. We keep that row. v1.0.1 optimization:
      // teach /nearby to accept an octane array so this becomes 1 call.
      const octanes = octanesFor(selection);
      const results = await Promise.all(
        octanes.map((o) =>
          supabase.functions.invoke<StationWithPrice[]>('nearby', {
            body: { latitude: lat, longitude: lon, octane: o, radius: radiusVal },
          }),
        ),
      );
      const fnError = results.find((r) => r.error)?.error;
      if (fnError) {
        setError(fnError.message);
        return;
      }

      // Merge by station id, keeping the cheapest priced row across the
      // octane variants. Falls back to a null-price row when all variants
      // are null (station still appears in the list, just without a price).
      const byId = new Map<string, StationWithPrice>();
      for (const { data } of results) {
        for (const s of data ?? []) {
          const prev = byId.get(s.id);
          if (!prev) {
            byId.set(s.id, s);
            continue;
          }
          const a = prev.price_cents;
          const b = s.price_cents;
          if (a === null && b !== null) byId.set(s.id, s);
          else if (a !== null && b !== null && b < a) byId.set(s.id, s);
        }
      }
      setStations(Array.from(byId.values()));
    },
    [],
  );

  const applyCurrentLocation = useCallback(async () => {
    setError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Location permission denied — search for a city above.');
      setLoading(false);
      return;
    }
    // Desktop browsers commonly never resolve getCurrentPositionAsync: the
    // user dismisses the permission prompt without choosing, or the browser
    // is configured to "ask each time" and the popup is suppressed. There's
    // no GPS to short-circuit it on desktop, so the call sits open forever
    // and the Pumps tab spins indefinitely. Race against an 8s timeout.
    let loc;
    try {
      loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Location request timed out')),
            8000,
          ),
        ),
      ]);
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes('timed out')
          ? 'Couldn’t read your location — search for a city above.'
          : 'Location unavailable — search for a city above.',
      );
      setLoading(false);
      return;
    }
    const next = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    setSearchLabel(null);
    setSearchInput('');
    setUsingCurrentLocation(true);
    setCoords(next);
    try {
      const places = await Location.reverseGeocodeAsync(next);
      setCurrentLocationLabel(formatLocationLabel(places[0] ?? null) || null);
    } catch {
      setCurrentLocationLabel(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [storedOctane, storedRadius, storedSort, storedRecents] = await Promise.all([
        getPreferredOctane(),
        getPreferredRadius(),
        getPreferredSort(),
        getRecentSearches(),
      ]);
      if (storedOctane) setOctane(storedOctane);
      if (storedRadius) setRadius(storedRadius);
      if (storedSort) setSort(storedSort);
      setRecents(storedRecents);
      await applyCurrentLocation();
    })();
  }, [applyCurrentLocation]);

  const handleOctaneChange = useCallback((next: OctaneSelection) => {
    setOctane(next);
    setPreferredOctane(next);
  }, []);

  const handleRadiusChange = useCallback((next: RadiusMeters) => {
    setRadius(next);
    setPreferredRadius(next);
  }, []);

  const applyRecent = useCallback((loc: RecentLocation) => {
    setUsingCurrentLocation(false);
    setSearchLabel(loc.label);
    setSearchInput('');
    setCoords({ latitude: loc.latitude, longitude: loc.longitude });
    setLoading(true);
  }, []);

  const submitSearch = useCallback(async () => {
    const q = searchInput.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        setError(`No results for "${q}".`);
        return;
      }
      const r = results[0];
      const next: RecentLocation = { label: q, latitude: r.latitude, longitude: r.longitude };
      setUsingCurrentLocation(false);
      setCoords({ latitude: r.latitude, longitude: r.longitude });
      setSearchLabel(q);
      setLoading(true);
      await pushRecentSearch(next);
      setRecents(await getRecentSearches());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }, [searchInput]);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    (async () => {
      await fetchNearby(coords.latitude, coords.longitude, octane, radius);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [octane, radius, coords, fetchNearby]);

  useEffect(() => {
    if (!session?.user?.id) {
      setFavoriteIds(new Set());
      return;
    }
    let cancelled = false;
    listFavoriteIds(session.user.id).then((ids) => {
      if (!cancelled) setFavoriteIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.brandHeader, brandStyle]}>
        <View style={styles.brandRule} />
        <Text style={styles.brandSmall}>FUEL · STOP</Text>
        <Text style={styles.brandWord}>Pump</Text>
        <Text style={styles.brandTagline}>find a price worth driving for.</Text>
      </Animated.View>

      <Pressable
        onPress={applyCurrentLocation}
        style={({ pressed }) => [styles.locationHeader, pressed && styles.locationHeaderPressed]}>
        <View style={styles.locationCorner} />
        <Ionicons
          name={usingCurrentLocation ? 'navigate' : 'location'}
          size={14}
          color={colors.rust}
        />
        <View style={styles.locationTextWrap}>
          <Text style={styles.locationLabel}>
            {usingCurrentLocation ? 'YOU ARE HERE' : 'VIEWING'}
          </Text>
          <Text style={styles.locationHeaderText} numberOfLines={1}>
            {usingCurrentLocation
              ? currentLocationLabel ?? 'somewhere on a road'
              : searchLabel ?? '—'}
          </Text>
        </View>
        {!usingCurrentLocation ? (
          <View style={styles.locationActionPill}>
            <Text style={styles.locationActionText}>USE GPS</Text>
          </View>
        ) : null}
      </Pressable>

      <Animated.View style={[styles.collapsibleClip, searchStyle]}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={15} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              placeholder="search city, zip, or address"
              placeholderTextColor={colors.inkFaint}
              value={searchInput}
              onChangeText={setSearchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={submitSearch}
              editable={!searching}
            />
            {searchInput.length > 0 ? (
              <Pressable onPress={() => setSearchInput('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.inkFaint} />
              </Pressable>
            ) : null}
          </View>
          {searching ? <ActivityIndicator color={colors.rust} /> : null}
        </View>
      </Animated.View>

      <Animated.View style={[styles.collapsibleClip, recentsStyle]}>
        {recents.length > 0 ? (
          <View style={styles.recentsWrap}>
            <Text style={styles.recentsHeader}>BOOKMARKED</Text>
            <View style={styles.recentsRow}>
              {recents.map((item) => {
                const active = !usingCurrentLocation && searchLabel === item.label;
                return (
                  <Pressable
                    key={item.label}
                    onPress={() => applyRecent(item)}
                    style={[styles.recentChip, active && styles.recentChipActive]}>
                    <Text
                      style={[styles.recentChipText, active && styles.recentChipTextActive]}
                      numberOfLines={1}>
                      {item.label.toLowerCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </Animated.View>

      <OctaneSelector value={octane} onChange={handleOctaneChange} />

      <View style={styles.sortRow}>
        <Text style={styles.sortHeading}>SORT BY</Text>
        <View style={styles.sortChips}>
          {(['cheapest', 'closest'] as const).map((key) => {
            const active = key === sort;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  if (!active) Haptics.selectionAsync();
                  setSort(key);
                  setPreferredSort(key);
                }}
                style={[styles.sortChip, active && styles.sortChipActive]}>
                <Text style={[styles.sortLabel, active && styles.sortLabelActive]}>
                  {key === 'cheapest' ? 'Cheapest' : 'Closest'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Animated.View style={[styles.collapsibleClip, radiusExpandedStyle]}>
        <RadiusSelector value={radius} onChange={handleRadiusChange} />
      </Animated.View>

      <Animated.View style={[styles.radiusChipBar, radiusChipStyle]}>
        <Text style={styles.radiusChipLabel}>RADIUS</Text>
        <Text style={styles.radiusChipValue}>
          {radius === 1609 ? '1' : radius === 4828 ? '3' : radius === 8047 ? '5' : '10'} MI
        </Text>
      </Animated.View>
      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          {error.toLowerCase().includes('permission') ? (
            <Pressable style={styles.linkButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.linkButtonText}>Open Settings</Text>
            </Pressable>
          ) : null}
        </View>
      ) : stations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            No stations within {Math.round(radius / 1000)} km of here. Try a wider radius.
          </Text>
        </View>
      ) : stations.every((s) => s.price_cents === null) ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            Stations are here, but we don&apos;t have prices for{' '}
            {octane === 'premium' ? 'any premium octane (91+)' : `${octane} octane`} yet.
          </Text>
          <Pressable
            style={styles.linkButton}
            onPress={async () => {
              if (!session) return;
              setRefreshing(true);
              await supabase.functions.invoke('refresh-station-prices', {
                body: { station_ids: stations.slice(0, 25).map((s) => s.id) },
              });
              if (coords) await fetchNearby(coords.latitude, coords.longitude, octane, radius);
              setRefreshing(false);
            }}>
            <Text style={styles.linkButtonText}>Refresh prices</Text>
          </Pressable>
        </View>
      ) : (
        <Animated.FlatList
          data={sortedStations}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              <Animated.View style={headerSpacerStyle} />
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>STATIONS</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          }
          ListFooterComponent={
            <>
              {hiddenUnpriced > 0 ? (
                <View style={styles.premiumHiddenNote}>
                  <Text style={styles.premiumHiddenText}>
                    + {hiddenUnpriced} nearby station
                    {hiddenUnpriced === 1 ? '' : 's'} without prices yet
                  </Text>
                </View>
              ) : null}
              <View style={styles.endMarker}>
                <View style={styles.dividerLine} />
                <Text style={styles.endMarkerText}>END OF ROAD</Text>
                <View style={styles.dividerLine} />
              </View>
              <Animated.View style={footerStyle} />
            </>
          }
          onLayout={(e) => {
            // Capture V0 as the *smallest* observed FlatList height —
            // that's the toolbar-fully-expanded state. Re-capturing the min
            // handles re-mounts (e.g. switching from empty-state to list).
            const h = e.nativeEvent.layout.height;
            if (v0.value === 0 || h < v0.value) v0.value = h;
          }}
          renderItem={({ item }) => {
            const sameWinner = cheapestId !== null && cheapestId === closestId;
            const showCheapest =
              item.id === cheapestId && (sort === 'cheapest' || sameWinner);
            const showClosest =
              item.id === closestId && (sort === 'closest' || sameWinner);
            return (
              <View
                onLayout={(e) =>
                  handleCardLayout(item.id, e.nativeEvent.layout.height)
                }>
                <StationCard
                  station={item}
                  isCheapest={showCheapest}
                  isClosest={showClosest}
                  favorited={favoriteIds.has(item.id)}
                />
              </View>
            );
          }}
          refreshControl={
            <RefreshControl
              tintColor={colors.rust}
              refreshing={refreshing}
              onRefresh={async () => {
                if (!coords) return;
                setRefreshing(true);
                await fetchNearby(coords.latitude, coords.longitude, octane, radius);
                setRefreshing(false);
              }}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, radius: radii, space }: Theme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  brandHeader: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    overflow: 'hidden',
  },
  collapsibleClip: { overflow: 'hidden' },
  radiusChipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.lg,
    overflow: 'hidden',
  },
  radiusChipLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.inkFaint,
    letterSpacing: 2,
  },
  radiusChipValue: {
    fontFamily: fonts.numeral,
    fontSize: 12,
    color: colors.rust,
    letterSpacing: 1,
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  brandRule: {
    width: 36,
    height: 2,
    backgroundColor: colors.rust,
    marginBottom: 8,
  },
  brandSmall: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.rust,
    letterSpacing: 4,
    marginBottom: 4,
  },
  brandWord: {
    fontFamily: fonts.display,
    fontSize: 38,
    color: colors.ink,
    lineHeight: 40,
    letterSpacing: -1,
  },
  brandTagline: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },

  loading: { marginTop: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: {
    color: colors.danger,
    textAlign: 'center',
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  muted: {
    color: colors.inkFaint,
    textAlign: 'center',
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
  },

  sortRow: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: 4,
  },
  sortHeading: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 2,
    marginBottom: 6,
  },
  sortChips: { flexDirection: 'row', gap: 8 },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.dust,
    backgroundColor: colors.paper,
  },
  sortChipActive: {
    borderColor: colors.rust,
    backgroundColor: colors.rust,
  },
  sortLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.inkSoft,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sortLabelActive: {
    color: colors.onRust,
    fontFamily: fonts.bodyBold,
  },

  linkButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.rust,
  },
  linkButtonText: {
    color: colors.onRust,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingTop: 4,
    gap: 8,
    alignItems: 'center',
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.paperEdge,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },

  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: space.lg,
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.rust,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  locationHeaderPressed: { opacity: 0.6 },
  locationCorner: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 20,
    height: 20,
    backgroundColor: colors.rust,
    transform: [{ rotate: '45deg' }],
  },
  locationTextWrap: { flex: 1 },
  locationLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.rust,
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  locationHeaderText: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.ink,
    lineHeight: 20,
  },
  locationActionPill: {
    backgroundColor: colors.displaySurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  locationActionText: {
    color: colors.displayInk,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.5,
  },

  recentsWrap: {
    paddingHorizontal: space.lg,
    paddingTop: 4,
    paddingBottom: 8,
  },
  recentsHeader: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 2,
    marginBottom: 6,
  },
  recentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recentChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.dust,
    backgroundColor: colors.paper,
  },
  recentChipActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  recentChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.inkSoft,
    maxWidth: 160,
  },
  recentChipTextActive: { color: colors.onAmber, fontFamily: fonts.bodyBold },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: 4,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.dust,
  },
  dividerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 3,
  },
  premiumHiddenNote: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: 4,
    alignItems: 'center',
  },
  premiumHiddenText: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.inkFaint,
    letterSpacing: 0.3,
  },
  endMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: 4,
    gap: 10,
  },
  endMarkerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 3,
  },
});
}
