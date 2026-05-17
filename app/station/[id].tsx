import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import {
  addFavorite,
  getFavoriteAlert,
  isFavorite,
  removeFavorite,
  setFavoriteAlert,
} from '@/lib/favorites';
import { formatDistance } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadow, space } from '@/lib/theme';
import {
  ALL_OCTANES,
  OCTANE_LABELS,
  PRIMARY_OCTANES,
  type Octane,
  type SourceKind,
  type Station,
  type StationWithPrice,
} from '@/lib/types';

type DetailPrice = {
  octane: Octane;
  price_cents: number;
  source_kind: SourceKind;
  observed_at: string;
};

type StationDetailResponse = {
  station: Station;
  prices: DetailPrice[];
};

// Pump panel rows: always show the 4 primaries (with `– – –` if no data),
// plus any secondary octane (86 / 94) that this station actually sells.
function pumpOctanesFor(prices: { octane: Octane }[]): Octane[] {
  const stationOctanes = new Set(prices.map((p) => p.octane));
  return ALL_OCTANES.filter(
    (o) => PRIMARY_OCTANES.includes(o) || stationOctanes.has(o),
  );
}

export default function StationDetail() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ id: string; seed?: string }>();

  const seed = useMemo<StationWithPrice | null>(() => {
    if (!params.seed) return null;
    try {
      return JSON.parse(params.seed) as StationWithPrice;
    } catch {
      return null;
    }
  }, [params.seed]);

  const [favorited, setFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [station, setStation] = useState<Station | null>(seed);
  const [prices, setPrices] = useState<DetailPrice[]>(() =>
    seed &&
    seed.octane != null &&
    seed.price_cents != null &&
    seed.source_kind != null &&
    seed.observed_at != null
      ? [
          {
            octane: seed.octane,
            price_cents: seed.price_cents,
            source_kind: seed.source_kind,
            observed_at: seed.observed_at,
          },
        ]
      : [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [alertOctane, setAlertOctane] = useState<Octane>(seed?.octane ?? 87);
  const [alertInput, setAlertInput] = useState('');
  const [alertSaved, setAlertSaved] = useState<{ octane: Octane | null; cents: number | null }>({
    octane: null,
    cents: null,
  });
  const [alertSaving, setAlertSaving] = useState(false);

  const fetchStation = useCallback(async () => {
    const { data } = await supabase.functions.invoke<StationDetailResponse>('station', {
      body: { id: params.id },
    });
    if (data?.station) {
      setStation(data.station);
      setPrices(data.prices ?? []);
    }
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchStation();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStation();
    setRefreshing(false);
  }, [fetchStation]);

  useEffect(() => {
    if (!session?.user?.id || !params.id) {
      setFavorited(false);
      return;
    }
    let cancelled = false;
    isFavorite(session.user.id, params.id).then((value) => {
      if (!cancelled) setFavorited(value);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, params.id]);

  useEffect(() => {
    if (!session?.user?.id || !params.id || !favorited) {
      setAlertSaved({ octane: null, cents: null });
      setAlertInput('');
      return;
    }
    let cancelled = false;
    getFavoriteAlert(session.user.id, params.id).then((cfg) => {
      if (cancelled || !cfg) return;
      setAlertSaved({
        octane: cfg.alert_octane,
        cents: cfg.alert_threshold_cents,
      });
      if (cfg.alert_octane) setAlertOctane(cfg.alert_octane);
      if (cfg.alert_threshold_cents != null) {
        setAlertInput((cfg.alert_threshold_cents / 100).toFixed(2));
      } else {
        setAlertInput('');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, params.id, favorited]);

  const toggleFavorite = useCallback(async () => {
    if (!session?.user?.id) {
      router.push('/sign-in');
      return;
    }
    if (favoritePending) return;
    const next = !favorited;
    setFavorited(next);
    setFavoritePending(true);
    Haptics.impactAsync(
      next ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    const { error: e } = next
      ? await addFavorite(session.user.id, params.id)
      : await removeFavorite(session.user.id, params.id);
    setFavoritePending(false);
    if (e) {
      setFavorited(!next);
    }
  }, [session?.user?.id, favorited, favoritePending, params.id, router]);

  const saveAlert = useCallback(async () => {
    if (!session?.user?.id || alertSaving) return;
    const trimmed = alertInput.trim();
    const dollars = parseFloat(trimmed);
    if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 15) {
      Alert.alert('Invalid price', 'Enter a dollar amount like 3.49.');
      return;
    }
    const cents = Math.round(dollars * 100);
    setAlertSaving(true);
    const { error } = await setFavoriteAlert(session.user.id, params.id, {
      alert_octane: alertOctane,
      alert_threshold_cents: cents,
    });
    setAlertSaving(false);
    if (error) {
      Alert.alert('Could not save alert', error.message);
      return;
    }
    setAlertSaved({ octane: alertOctane, cents });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [session?.user?.id, alertInput, alertOctane, alertSaving, params.id]);

  const clearAlert = useCallback(async () => {
    if (!session?.user?.id || alertSaving) return;
    setAlertSaving(true);
    const { error } = await setFavoriteAlert(session.user.id, params.id, {
      alert_octane: null,
      alert_threshold_cents: null,
    });
    setAlertSaving(false);
    if (error) {
      Alert.alert('Could not clear alert', error.message);
      return;
    }
    setAlertSaved({ octane: null, cents: null });
    setAlertInput('');
  }, [session?.user?.id, alertSaving, params.id]);

  if (!station && loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.rust} />
      </View>
    );
  }

  if (!station) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>couldn&apos;t load this station.</Text>
        <Pressable
          style={styles.retryButton}
          onPress={async () => {
            setLoading(true);
            await fetchStation();
            setLoading(false);
          }}>
          <Text style={styles.retryButtonText}>RETRY</Text>
        </Pressable>
      </View>
    );
  }

  const priceByOctane = new Map<Octane, DetailPrice>();
  for (const p of prices) priceByOctane.set(p.octane, p);

  const openDirections = () => {
    const placePart = station.google_place_id
      ? `&destination_place_id=${encodeURIComponent(station.google_place_id)}`
      : '';
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}${placePart}`;
    Linking.openURL(url);
  };

  const alertActive = alertSaved.octane != null && alertSaved.cents != null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.rust}
          />
        }>
        {/* Header — vintage receipt header with brand at scale */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <Text style={styles.headerLabel}>STATION</Text>
            <Pressable
              onPress={toggleFavorite}
              hitSlop={12}
              style={({ pressed }) => [styles.heartButton, pressed && styles.heartPressed]}
              accessibilityLabel={favorited ? 'Remove favorite' : 'Add favorite'}>
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={22}
                color={favorited ? colors.rust : colors.inkSoft}
              />
            </Pressable>
          </View>

          <Text style={styles.brand} numberOfLines={2}>
            {(station.brand ?? station.name).toUpperCase()}
          </Text>
          {station.brand && station.brand !== station.name ? (
            <Text style={styles.subbrand}>{station.name.toLowerCase()}</Text>
          ) : null}

          <View style={styles.divider} />

          <Text style={styles.address}>{station.address.toLowerCase()}</Text>
          {seed?.distance_meters != null ? (
            <Text style={styles.distance}>
              {formatDistance(seed.distance_meters)} from where you are
            </Text>
          ) : null}
        </View>

        {/* The pump display — 4 octane rows like a real fuel pump */}
        <View style={styles.pumpPanel}>
          <View style={styles.pumpHeader}>
            <Text style={styles.pumpHeaderText}>FUEL · PRICE PER GALLON</Text>
          </View>
          {pumpOctanesFor(prices).map((o) => {
            const p = priceByOctane.get(o);
            const highlight = seed?.octane === o;
            return (
              <View key={o} style={[styles.pumpRow, highlight && styles.pumpRowActive]}>
                <View style={styles.pumpRowLeft}>
                  <Text
                    style={[styles.pumpOctane, highlight && styles.pumpOctaneActive]}>
                    {o}
                  </Text>
                  <Text style={styles.pumpOctaneLabel}>
                    {OCTANE_LABELS[o].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.pumpRowRight}>
                  {p ? (
                    <>
                      <View style={styles.pumpDigits}>
                        <Text style={styles.priceWhole}>
                          {Math.floor(p.price_cents / 100)}
                        </Text>
                        <Text style={styles.priceDot}>.</Text>
                        <Text style={styles.priceFraction}>
                          {(p.price_cents % 100).toString().padStart(2, '0')}
                        </Text>
                      </View>
                      <Text style={styles.priceMeta}>
                        {sourceLabel(p.source_kind)} · {relativeTime(p.observed_at)}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.priceMissing}>– – –</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          onPress={openDirections}>
          <Ionicons name="navigate" size={16} color={colors.amber} />
          <Text style={styles.primaryBtnText}>GET DIRECTIONS</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/upload',
              params: {
                stationId: station.id,
                stationLabel: station.brand ?? station.name,
              },
            })
          }>
          <Ionicons name="camera-outline" size={16} color={colors.rust} />
          <Text style={styles.secondaryBtnText}>REPORT A PRICE</Text>
        </Pressable>

        {favorited ? (
          <View style={styles.alertCard}>
            <View style={styles.alertHeader}>
              <View style={styles.alertHeaderLine} />
              <Text style={styles.alertTitle}>PRICE WATCH</Text>
              <View style={styles.alertHeaderLine} />
            </View>
            <Text style={styles.alertHint}>
              We&apos;ll buzz your phone when this pump drops to or below your
              threshold.
            </Text>

            <Text style={styles.alertSection}>OCTANE</Text>
            <View style={styles.alertOctaneRow}>
              {pumpOctanesFor(prices).map((o) => {
                const active = alertOctane === o;
                return (
                  <Pressable
                    key={o}
                    onPress={() => setAlertOctane(o)}
                    style={[styles.alertChip, active && styles.alertChipActive]}>
                    <Text
                      style={[styles.alertChipText, active && styles.alertChipTextActive]}>
                      {o}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.alertSection}>NOTIFY ME WHEN ≤</Text>
            <View style={styles.alertInputRow}>
              <Text style={styles.alertDollar}>$</Text>
              <TextInput
                value={alertInput}
                onChangeText={setAlertInput}
                placeholder="3.49"
                placeholderTextColor={colors.inkFaint}
                keyboardType="decimal-pad"
                inputMode="decimal"
                style={styles.alertInput}
                editable={!alertSaving}
              />
              <Pressable
                onPress={saveAlert}
                disabled={alertSaving || alertInput.trim().length === 0}
                style={({ pressed }) => [
                  styles.alertSaveButton,
                  (alertSaving || alertInput.trim().length === 0) && styles.alertButtonDisabled,
                  pressed && styles.alertButtonPressed,
                ]}>
                <Text style={styles.alertSaveText}>
                  {alertActive ? 'UPDATE' : 'SET'}
                </Text>
              </Pressable>
            </View>

            {alertActive ? (
              <View style={styles.alertActiveRow}>
                <Text style={styles.alertActiveText}>
                  watching {alertSaved.octane} oct ≤ ${(alertSaved.cents! / 100).toFixed(2)}
                </Text>
                <Pressable onPress={clearAlert} disabled={alertSaving} hitSlop={8}>
                  <Text style={styles.alertClearText}>clear</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function sourceLabel(kind: SourceKind): string {
  switch (kind) {
    case 'scrape':
      return 'auto';
    case 'crowd':
      return 'reported';
    case 'official':
      return 'verified';
    case 'google':
      return 'google';
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  error: {
    color: colors.danger,
    textAlign: 'center',
    fontFamily: fonts.bodyItalic,
    fontSize: 16,
  },

  headerCard: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    padding: space.lg,
    ...shadow.panel,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.rust,
    letterSpacing: 3,
  },
  heartButton: { padding: 2 },
  heartPressed: { opacity: 0.5 },
  brand: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.ink,
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 6,
  },
  subbrand: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.dust,
    marginVertical: space.md,
  },
  address: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  distance: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkFaint,
    marginTop: 4,
  },

  pumpPanel: {
    marginTop: space.lg,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  pumpHeader: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    backgroundColor: colors.rustDark,
    alignItems: 'center',
  },
  pumpHeaderText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.amber,
    letterSpacing: 3,
  },
  pumpRow: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 136, 44, 0.18)',
    alignItems: 'center',
  },
  pumpRowActive: {
    backgroundColor: 'rgba(212, 136, 44, 0.08)',
  },
  pumpRowLeft: { flex: 1 },
  pumpOctane: {
    fontFamily: fonts.priceHeavy,
    fontSize: 26,
    color: colors.paper,
    letterSpacing: 1,
  },
  pumpOctaneActive: { color: colors.amber },
  pumpOctaneLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.inkFaint,
    letterSpacing: 2,
    marginTop: 2,
  },
  pumpRowRight: { alignItems: 'flex-end' },
  pumpDigits: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  priceWhole: {
    fontFamily: fonts.priceHeavy,
    fontSize: 32,
    color: colors.amber,
    lineHeight: 34,
  },
  priceDot: {
    fontFamily: fonts.priceHeavy,
    fontSize: 32,
    color: colors.amber,
    lineHeight: 34,
    marginHorizontal: 1,
  },
  priceFraction: {
    fontFamily: fonts.priceHeavy,
    fontSize: 22,
    color: colors.amber,
    lineHeight: 32,
    marginBottom: 1,
  },
  priceMissing: {
    fontFamily: fonts.numeral,
    fontSize: 24,
    color: 'rgba(212, 136, 44, 0.3)',
    letterSpacing: 4,
  },
  priceMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkFaint,
    marginTop: 2,
  },

  primaryBtn: {
    marginTop: space.lg,
    backgroundColor: colors.ink,
    paddingVertical: 14,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...shadow.panel,
  },
  primaryBtnText: {
    color: colors.amber,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 3,
  },
  secondaryBtn: {
    marginTop: space.sm,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.rust,
    backgroundColor: colors.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondaryBtnText: {
    color: colors.rust,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 3,
  },
  btnPressed: { opacity: 0.85 },

  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.rust,
  },
  retryButtonText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
  },

  alertCard: {
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    borderStyle: 'dashed',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  alertHeaderLine: { flex: 1, height: 1, backgroundColor: colors.dust },
  alertTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.rust,
    letterSpacing: 4,
  },
  alertHint: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: space.md,
  },
  alertSection: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.inkFaint,
    letterSpacing: 2,
    marginTop: space.sm,
    marginBottom: 6,
  },
  alertOctaneRow: { flexDirection: 'row', gap: 8 },
  alertChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.dust,
    alignItems: 'center',
  },
  alertChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  alertChipText: {
    fontFamily: fonts.numeral,
    fontSize: 14,
    color: colors.ink,
  },
  alertChipTextActive: { color: colors.amber },
  alertInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertDollar: {
    fontFamily: fonts.numeral,
    fontSize: 22,
    color: colors.rust,
  },
  alertInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dust,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.numeral,
    fontSize: 18,
    color: colors.ink,
  },
  alertSaveButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.sm,
    backgroundColor: colors.rust,
  },
  alertButtonDisabled: { opacity: 0.4 },
  alertButtonPressed: { opacity: 0.8 },
  alertSaveText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 2,
  },
  alertActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.dust,
    borderStyle: 'dashed',
  },
  alertActiveText: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkSoft,
    flex: 1,
  },
  alertClearText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.rust,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
