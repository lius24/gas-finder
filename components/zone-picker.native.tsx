import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type LatLng } from 'react-native-maps';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius as radii, space } from '@/lib/theme';
import {
  DEFAULT_ZONE_RADIUS_METERS,
  ZONE_RADIUS_OPTIONS_METERS,
  type ZoneRadiusMeters,
  getZone,
  saveZone,
  stationsInCircle,
} from '@/lib/zones';

type Pin = LatLng;

const RADIUS_CHIP_LABEL: Record<ZoneRadiusMeters, string> = {
  5000: '5 km',
  10000: '10 km',
  25000: '25 km',
  50000: '50 km',
};

export function ZonePicker() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [pin, setPin] = useState<Pin | null>(null);
  const [zoneRadius, setZoneRadius] = useState<ZoneRadiusMeters>(
    DEFAULT_ZONE_RADIUS_METERS,
  );
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [original, setOriginal] = useState<{
    pin: Pin;
    radius: ZoneRadiusMeters;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const z = await getZone(userId);
      if (z) {
        const p: Pin = { latitude: z.latitude, longitude: z.longitude };
        const r = (ZONE_RADIUS_OPTIONS_METERS.includes(z.radius_m as ZoneRadiusMeters)
          ? z.radius_m
          : DEFAULT_ZONE_RADIUS_METERS) as ZoneRadiusMeters;
        setPin(p);
        setZoneRadius(r);
        setOriginal({ pin: p, radius: r });
      } else {
        // No zone yet — try current location as the default pin.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setPin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      }
    })();
  }, [userId]);

  const changed = useMemo(() => {
    if (!pin) return false;
    if (!original) return true;
    return (
      pin.latitude !== original.pin.latitude ||
      pin.longitude !== original.pin.longitude ||
      zoneRadius !== original.radius
    );
  }, [pin, zoneRadius, original]);

  const doSearch = useCallback(async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await Location.geocodeAsync(q);
      if (res.length > 0) {
        setPin({ latitude: res[0].latitude, longitude: res[0].longitude });
      } else {
        setToast(`No results for "${q}"`);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [search]);

  const useGps = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setToast('Location permission denied');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setPin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
  }, []);

  const save = useCallback(async () => {
    if (!userId || !pin) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await saveZone({
        user_id: userId,
        latitude: pin.latitude,
        longitude: pin.longitude,
        radius_m: zoneRadius,
      });
      setOriginal({ pin, radius: zoneRadius });

      const ids = await stationsInCircle(pin.latitude, pin.longitude, zoneRadius);
      if (ids.length === 0) {
        setToast('Zone saved — no stations to refresh yet.');
        return;
      }

      const firstChunk = ids.slice(0, 25);
      const remaining = Math.max(0, ids.length - firstChunk.length);

      const { error } = await supabase.functions.invoke('refresh-station-prices', {
        body: { station_ids: firstChunk },
      });
      if (error) {
        setToast(`Zone saved. First refresh failed: ${error.message}`);
      } else if (remaining > 0) {
        setToast(
          `Refreshed ${firstChunk.length} of ${ids.length} — the rest land by tomorrow.`,
        );
      } else {
        setToast(`Refreshed prices for ${firstChunk.length} stations.`);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [userId, pin, zoneRadius]);

  if (!userId) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>
        We refresh gas prices daily for stations inside this circle.
      </Text>

      <View style={styles.mapWrap}>
        {pin ? (
          <MapView
            style={styles.map}
            region={{
              latitude: pin.latitude,
              longitude: pin.longitude,
              latitudeDelta: zoneRadius / 50000,
              longitudeDelta: zoneRadius / 50000,
            }}
            onPress={(e) => setPin(e.nativeEvent.coordinate)}>
            <Marker coordinate={pin} pinColor={colors.rust} />
            <Circle
              center={pin}
              radius={zoneRadius}
              strokeColor={colors.rust}
              fillColor="rgba(178, 84, 56, 0.12)"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.muted}>Pick a location to begin.</Text>
          </View>
        )}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={15} color={colors.inkSoft} />
          <TextInput
            style={styles.searchInput}
            placeholder="search city, zip, or address"
            placeholderTextColor={colors.inkFaint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={doSearch}
            editable={!searching}
          />
          {searching ? <ActivityIndicator color={colors.rust} /> : null}
        </View>
        <Pressable
          onPress={useGps}
          style={({ pressed }) => [styles.gpsButton, pressed && styles.btnPressed]}>
          <Ionicons name="navigate" size={14} color={colors.amber} />
          <Text style={styles.gpsButtonText}>GPS</Text>
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        {ZONE_RADIUS_OPTIONS_METERS.map((r) => {
          const active = r === zoneRadius;
          return (
            <Pressable
              key={r}
              onPress={() => {
                if (!active) Haptics.selectionAsync();
                setZoneRadius(r);
              }}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {RADIUS_CHIP_LABEL[r]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        disabled={!changed || saving}
        onPress={save}
        style={({ pressed }) => [
          styles.saveButton,
          (!changed || saving) && styles.saveButtonDisabled,
          pressed && styles.btnPressed,
        ]}>
        <Text style={styles.saveButtonText}>
          {saving ? 'SAVING…' : 'SAVE ZONE'}
        </Text>
      </Pressable>

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    gap: 10,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkSoft,
  },
  mapWrap: { height: 180, borderRadius: radii.md, overflow: 'hidden' },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  muted: {
    color: colors.inkSoft,
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
  },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.paperEdge,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.ink,
    borderRadius: radii.md,
  },
  gpsButtonText: {
    color: colors.amber,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.dust,
    backgroundColor: colors.paper,
  },
  chipActive: {
    borderColor: colors.rust,
    backgroundColor: colors.rust,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.inkSoft,
    letterSpacing: 1,
  },
  chipTextActive: { color: colors.paper, fontFamily: fonts.bodyBold },
  saveButton: {
    marginTop: 6,
    paddingVertical: 12,
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: colors.dust },
  saveButtonText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 2,
  },
  btnPressed: { opacity: 0.85 },
  toast: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.inkSoft,
  },
});
