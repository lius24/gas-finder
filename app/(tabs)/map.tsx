import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OctaneSelector } from '@/components/octane-selector';
import { RadiusSelector } from '@/components/radius-selector';
import { formatPriceCents } from '@/lib/geo';
import {
  DEFAULT_RADIUS_METERS,
  getPreferredOctane,
  getPreferredRadius,
  setPreferredOctane,
  setPreferredRadius,
  type RadiusMeters,
} from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius as radii } from '@/lib/theme';
import type { Octane, StationWithPrice } from '@/lib/types';

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);
  const [octane, setOctane] = useState<Octane>(93);
  const [radius, setRadius] = useState<RadiusMeters>(DEFAULT_RADIUS_METERS);
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [stations, setStations] = useState<StationWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNearby = useCallback(
    async (lat: number, lon: number, octaneVal: Octane, radiusVal: RadiusMeters) => {
      const { data } = await supabase.functions.invoke<StationWithPrice[]>('nearby', {
        body: {
          latitude: lat,
          longitude: lon,
          octane: octaneVal,
          radius: radiusVal,
        },
      });
      setStations(data ?? []);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const [storedOctane, storedRadius] = await Promise.all([
        getPreferredOctane(),
        getPreferredRadius(),
      ]);
      if (storedOctane) setOctane(storedOctane);
      if (storedRadius) setRadius(storedRadius);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords(loc.coords);
      setLoading(false);
    })();
  }, []);

  const handleOctaneChange = useCallback((next: Octane) => {
    setOctane(next);
    setPreferredOctane(next);
  }, []);

  const handleRadiusChange = useCallback((next: RadiusMeters) => {
    setRadius(next);
    setPreferredRadius(next);
  }, []);

  useEffect(() => {
    if (!coords) return;
    fetchNearby(coords.latitude, coords.longitude, octane, radius);
  }, [coords, octane, radius, fetchNearby]);

  const onRefresh = useCallback(async () => {
    if (!coords || refreshing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await fetchNearby(coords.latitude, coords.longitude, octane, radius);
    setRefreshing(false);
  }, [coords, octane, radius, fetchNearby, refreshing]);

  const onRecenter = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setCoords(loc.coords);
    mapRef.current?.animateToRegion(
      {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      400,
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!coords) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Location permission needed.</Text>
        <Pressable style={styles.settingsButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsButtonText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <OctaneSelector value={octane} onChange={handleOctaneChange} />
      <RadiusSelector value={radius} onChange={handleRadiusChange} />
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation>
          {stations.map((s) => (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.latitude, longitude: s.longitude }}
              title={s.brand ?? s.name}
              description={`${formatPriceCents(s.price_cents)} · ${s.octane}`}
              onCalloutPress={() =>
                router.push({
                  pathname: '/station/[id]',
                  params: { id: s.id, seed: JSON.stringify(s) },
                })
              }>
              <View style={styles.priceBadge}>
                <Text style={styles.priceText}>{formatPriceCents(s.price_cents)}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
        <View style={styles.fabColumn} pointerEvents="box-none">
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
            accessibilityLabel="Refresh prices">
            {refreshing ? (
              <ActivityIndicator color={colors.rust} />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.rust} />
            )}
          </Pressable>
          <Pressable
            onPress={onRecenter}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
            accessibilityLabel="Recenter on me">
            <Ionicons name="locate" size={20} color={colors.rust} />
          </Pressable>
        </View>
        {!refreshing && stations.length === 0 ? (
          <View style={styles.emptyBanner} pointerEvents="none">
            <Text style={styles.emptyBannerText}>
              No stations with {octane} within this radius. Try a wider radius or another octane.
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  muted: {
    color: colors.inkSoft,
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
  },
  priceBadge: {
    backgroundColor: colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  priceText: {
    color: colors.amber,
    fontFamily: fonts.numeral,
    fontSize: 13,
  },
  settingsButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.rust,
  },
  settingsButtonText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
  },
  fabColumn: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 10,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.paperEdge,
    shadowColor: '#28190C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  fabPressed: { backgroundColor: colors.bg },
  emptyBanner: {
    position: 'absolute',
    left: 16,
    right: 70,
    top: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.rust,
    shadowColor: '#28190C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyBannerText: {
    color: colors.ink,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
});
