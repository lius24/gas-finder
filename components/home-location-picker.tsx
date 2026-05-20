// Home-location setting — lets the user pin a primary address (home or
// work) that the Pumps tab can fall back to when GPS is denied. Search a
// city/zip/address, geocode it, persist via lib/preferences. Theme-aware.

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getHomeLocation, setHomeLocation, type HomeLocation } from '@/lib/preferences';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

export function HomeLocationPicker() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  const [home, setHome] = useState<HomeLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHomeLocation().then((h) => {
      setHome(h);
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        setError(`Couldn't find "${q}". Try a city, zip, or full address.`);
        return;
      }
      const next: HomeLocation = {
        label: q,
        latitude: results[0].latitude,
        longitude: results[0].longitude,
      };
      await setHomeLocation(next);
      setHome(next);
      setEditing(false);
      setQuery('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    await setHomeLocation(null);
    setHome(null);
    setEditing(false);
    setQuery('');
  };

  if (!loaded) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.rust} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {home && !editing ? (
        <View style={styles.savedRow}>
          <View style={styles.pinBadge}>
            <Ionicons name="home" size={16} color={colors.onRust} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.savedLabel}>HOME</Text>
            <Text style={styles.savedValue} numberOfLines={1}>
              {home.label}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setEditing(true);
              setQuery(home.label);
            }}
            style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.editWrap}>
          <Text style={styles.editHint}>
            Set a home address so Pump can rank stations even when GPS is off.
          </Text>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color={colors.inkFaint} />
            <TextInput
              style={styles.input}
              placeholder="City, zip, or full address"
              placeholderTextColor={colors.inkFaint}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={save}
              editable={!busy}
            />
          </View>
          <View style={styles.editActions}>
            <Pressable
              onPress={save}
              disabled={busy || query.trim().length === 0}
              style={[
                styles.primaryBtn,
                (busy || query.trim().length === 0) && styles.disabled,
              ]}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.onRust} />
              ) : (
                <Text style={styles.primaryBtnText}>Save home</Text>
              )}
            </Pressable>
            {home ? (
              <Pressable onPress={clear} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Remove</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setEditing(false);
                  setQuery('');
                  setError(null);
                }}
                style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
            )}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}
    </View>
  );
}

function makeStyles({ colors, fonts, radius, space }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      padding: space.lg,
    },

    savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    pinBadge: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: colors.rust,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.inkFaint,
      letterSpacing: 2,
      marginBottom: 2,
    },
    savedValue: {
      fontFamily: fonts.display,
      fontSize: 17,
      color: colors.ink,
    },
    textBtn: { paddingHorizontal: 8, paddingVertical: 6 },
    textBtnLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.rust,
    },

    editWrap: { gap: 12 },
    editHint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: colors.inkSoft,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },
    input: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.ink,
    },
    editActions: { flexDirection: 'row', gap: 8 },
    primaryBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: colors.rust,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.onRust,
      letterSpacing: 0.5,
    },
    ghostBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      alignItems: 'center',
    },
    ghostBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.inkSoft,
    },
    disabled: { opacity: 0.5 },
    error: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: colors.danger,
      lineHeight: 17,
    },
  });
}
