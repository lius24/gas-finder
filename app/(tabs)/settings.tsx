import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemePicker } from '@/components/theme-picker';
import { ZonePicker } from '@/components/zone-picker';
import { useAuth } from '@/lib/auth';
import { listFavorites, type FavoriteWithStation } from '@/lib/favorites';
import { supabase } from '@/lib/supabase';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const { session, loading } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteWithStation[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRule} />
        <Text style={styles.kicker}>YOUR · GARAGE</Text>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>APPEARANCE</Text>
          <ThemePicker />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ABOUT</Text>
          <Link href="/about" asChild>
            <Pressable
              style={({ pressed }) => [
                styles.aboutCard,
                pressed && styles.btnPressed,
              ]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.aboutTitle}>How the math works</Text>
                <Text style={styles.aboutBody}>
                  The decision-math formula and why "cheaper" isn't always cheaper.
                </Text>
              </View>
              <Text style={styles.aboutArrow}>›</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT</Text>
          {loading ? (
            <Text style={styles.muted}>loading…</Text>
          ) : session ? (
            <View style={styles.accountCard}>
              <View>
                <Text style={styles.accountLabel}>SIGNED IN AS</Text>
                <Text style={styles.accountEmail} numberOfLines={1}>
                  {session.user.email}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.signOutButton,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => supabase.auth.signOut()}>
                <Text style={styles.signOutText}>SIGN OUT</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.accountCard}>
              <Text style={styles.muted}>
                sign in to save favorites and have your reports counted.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.signInButton,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => router.push('/sign-in')}>
                <Text style={styles.signInText}>SIGN IN</Text>
              </Pressable>
            </View>
          )}
        </View>

        {session ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>PRICE TRACKING ZONE</Text>
            <ZonePicker />
          </View>
        ) : null}

        {session ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>FAVORITES</Text>
            {favoritesLoading ? (
              <Text style={styles.muted}>loading…</Text>
            ) : favorites.length === 0 ? (
              <Text style={styles.muted}>
                no favorites yet — tap the heart on a station to save it.
              </Text>
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
                      </Pressable>
                    </Link>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, radius, space }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, paddingBottom: 32 },
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
    },
    section: { marginTop: space.xl },
    sectionHeader: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.inkFaint,
      letterSpacing: 3,
      marginBottom: 10,
    },
    muted: {
      color: colors.inkSoft,
      fontFamily: fonts.bodyItalic,
      fontSize: 14,
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

    accountCard: {
      padding: space.lg,
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    accountLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.inkFaint,
      letterSpacing: 2,
      marginBottom: 4,
    },
    accountEmail: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: colors.ink,
      maxWidth: 220,
    },
    signOutButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.danger,
      borderRadius: radius.md,
    },
    signOutText: {
      color: colors.paper,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 2,
    },
    signInButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.ink,
      borderRadius: radius.md,
    },
    signInText: {
      color: colors.amber,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 2,
    },
    btnPressed: { opacity: 0.85 },

    favList: {
      backgroundColor: colors.paper,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      overflow: 'hidden',
    },
    favRow: {
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
  });
}
