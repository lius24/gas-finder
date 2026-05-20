// Garage — the settings screen. Profile hero at the top, then themed
// sections: Appearance (theme picker), Home location, About, and for
// signed-in users a Price-tracking zone + Favorites list. Theme-aware via
// useTheme(). Sign-in is handled by the shared SignInPanel (also reachable
// from the top nav bar).

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeLocationPicker } from '@/components/home-location-picker';
import { SignInPanel } from '@/components/sign-in-panel';
import { ThemePicker } from '@/components/theme-picker';
import { ZonePicker } from '@/components/zone-picker';
import { useAuth } from '@/lib/auth';
import { listFavorites, type FavoriteWithStation } from '@/lib/favorites';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const { session, loading, signOut } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteWithStation[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setFavorites([]);
      return;
    }
    let cancelled = false;
    setFavoritesLoading(true);
    listFavorites(session.user.id).then((rows) => {
      if (cancelled) return;
      setFavorites(rows);
      setFavoritesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const email = session?.user?.email ?? null;
  const avatarInitial = (email?.[0] ?? 'G').toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRule} />
        <Text style={styles.kicker}>YOUR · GARAGE</Text>
        <Text style={styles.title}>Settings</Text>

        {/* Profile hero — avatar + identity + sign-in / sign-out */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileLabel}>
              {loading ? 'LOADING' : session ? 'SIGNED IN' : 'NOT SIGNED IN'}
            </Text>
            <Text style={styles.profileValue} numberOfLines={1}>
              {loading ? '…' : session ? email : 'Guest driver'}
            </Text>
          </View>
          {!loading ? (
            session ? (
              <Pressable
                onPress={signOut}
                style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}>
                <Text style={styles.outlineBtnText}>Sign out</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setPanelOpen(true)}
                style={({ pressed }) => [styles.fillBtn, pressed && styles.pressed]}>
                <Text style={styles.fillBtnText}>Sign in</Text>
              </Pressable>
            )
          ) : null}
        </View>

        {!session && !loading ? (
          <Text style={styles.profileHint}>
            Sign in to save favorites, set price alerts, and sync across devices.
          </Text>
        ) : null}

        {/* Appearance */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="color-palette-outline" size={15} color={colors.rust} />
            <Text style={styles.sectionHeader}>APPEARANCE</Text>
          </View>
          <Text style={styles.sectionSub}>
            Pick a look. Each theme restyles the whole app.
          </Text>
          <ThemePicker />
        </View>

        {/* Home location */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="home-outline" size={15} color={colors.rust} />
            <Text style={styles.sectionHeader}>HOME LOCATION</Text>
          </View>
          <HomeLocationPicker />
        </View>

        {/* About */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="calculator-outline" size={15} color={colors.rust} />
            <Text style={styles.sectionHeader}>ABOUT</Text>
          </View>
          <Link href="/about" asChild>
            <Pressable
              style={({ pressed }) => [styles.aboutCard, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.aboutTitle}>How the math works</Text>
                <Text style={styles.aboutBody}>
                  The decision-math formula and why &quot;cheaper&quot; isn&apos;t always
                  cheaper.
                </Text>
              </View>
              <Text style={styles.aboutArrow}>›</Text>
            </Pressable>
          </Link>
        </View>

        {/* Price-tracking zone — signed-in only */}
        {session ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Ionicons name="locate-outline" size={15} color={colors.rust} />
              <Text style={styles.sectionHeader}>PRICE TRACKING ZONE</Text>
            </View>
            <ZonePicker />
          </View>
        ) : null}

        {/* Favorites — signed-in only */}
        {session ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Ionicons name="heart-outline" size={15} color={colors.rust} />
              <Text style={styles.sectionHeader}>FAVORITES</Text>
            </View>
            {favoritesLoading ? (
              <Text style={styles.muted}>loading…</Text>
            ) : favorites.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.muted}>
                  No favorites yet — tap the heart on a station to save it.
                </Text>
              </View>
            ) : (
              <View style={styles.favList}>
                {favorites.map((f) => {
                  const hasAlert =
                    f.alert_threshold_cents != null && f.alert_octane != null;
                  return (
                    <Link
                      key={f.station_id}
                      href={{
                        pathname: '/station/[id]',
                        params: {
                          id: f.station_id,
                          seed: JSON.stringify(f.station),
                        },
                      }}
                      asChild>
                      <Pressable
                        style={({ pressed }) => [
                          styles.favRow,
                          pressed && styles.favRowPressed,
                        ]}>
                        <View style={styles.favLeft}>
                          <Text style={styles.favBrand} numberOfLines={1}>
                            {(f.station.brand ?? f.station.name).toUpperCase()}
                          </Text>
                          <Text style={styles.favAddress} numberOfLines={1}>
                            {f.station.address.toLowerCase()}
                          </Text>
                          {hasAlert ? (
                            <Text style={styles.favAlert}>
                              ♢ alert · {f.alert_octane} oct ≤ $
                              {(f.alert_threshold_cents! / 100).toFixed(2)}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.favArrow}>›</Text>
                      </Pressable>
                    </Link>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {panelOpen ? (
        <SignInPanel
          onClose={() => setPanelOpen(false)}
          onSignOut={async () => {
            await signOut();
            setPanelOpen(false);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, radius, space }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, paddingBottom: 48 },
    brandRule: { width: 36, height: 2, backgroundColor: colors.rust, marginBottom: 10 },
    kicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.rust,
      letterSpacing: 4,
      marginBottom: 4,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 36,
      color: colors.ink,
      lineHeight: 38,
      letterSpacing: -0.5,
    },

    // Profile hero
    profileCard: {
      marginTop: space.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: space.lg,
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 9999,
      backgroundColor: colors.rust,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: fonts.display,
      fontSize: 24,
      color: colors.onRust,
    },
    profileText: { flex: 1 },
    profileLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.inkFaint,
      letterSpacing: 2,
      marginBottom: 3,
    },
    profileValue: {
      fontFamily: fonts.display,
      fontSize: 18,
      color: colors.ink,
    },
    profileHint: {
      marginTop: 8,
      fontFamily: fonts.bodyItalic,
      fontSize: 13,
      color: colors.inkSoft,
      lineHeight: 19,
    },
    fillBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.rust,
    },
    fillBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.onRust,
      letterSpacing: 0.8,
    },
    outlineBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },
    outlineBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.inkSoft,
      letterSpacing: 0.8,
    },
    pressed: { opacity: 0.8 },

    section: { marginTop: space.xl },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginBottom: 6,
    },
    sectionHeader: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.inkFaint,
      letterSpacing: 3,
    },
    sectionSub: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
      marginBottom: 12,
      lineHeight: 18,
    },
    muted: {
      color: colors.inkSoft,
      fontFamily: fonts.bodyItalic,
      fontSize: 14,
    },
    emptyCard: {
      padding: space.lg,
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },

    aboutCard: {
      padding: space.lg,
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    aboutTitle: {
      fontFamily: fonts.display,
      fontSize: 18,
      color: colors.ink,
      marginBottom: 4,
      letterSpacing: 0.3,
    },
    aboutBody: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
      lineHeight: 18,
    },
    aboutArrow: {
      fontFamily: fonts.display,
      fontSize: 26,
      color: colors.rust,
    },

    favList: {
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      overflow: 'hidden',
    },
    favRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.paperEdge,
    },
    favRowPressed: { backgroundColor: colors.bg },
    favLeft: { flex: 1 },
    favBrand: {
      fontFamily: fonts.display,
      fontSize: 16,
      color: colors.ink,
      letterSpacing: 0.5,
    },
    favAddress: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    favAlert: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      color: colors.rust,
      marginTop: 4,
    },
    favArrow: {
      fontFamily: fonts.display,
      fontSize: 22,
      color: colors.inkFaint,
    },
  });
}
