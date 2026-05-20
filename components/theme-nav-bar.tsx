// Web-only custom top tab bar that doubles as the marketing nav strip
// shown in the Ferrari + Airtable previews. Renders brand-mark left, the
// route menu (Pumps · Atlas · Report · Garage) center/inline, and theme-
// appropriate right-side actions (Sign in / Get started on Airtable,
// EN-US · Sign in on Ferrari).
//
// Mounted via Tabs.tabBar in app/(tabs)/_layout.tsx on web. Native still
// uses Expo Router's default bottom tab bar — see _layout.tsx.

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth';
import type { Theme } from '@/lib/theme';
import { useTheme, useThemeId } from '@/lib/theme-provider';
import { SignInPanel } from '@/components/sign-in-panel';

const ROUTE_TITLES: Record<string, string> = {
  index: 'Pumps',
  map: 'Atlas',
  upload: 'Report',
  settings: 'Garage',
};

export function ThemeNavBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const themeId = useThemeId();
  const { session, signOut } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const { width } = useWindowDimensions();
  // Mirror the preview's media query: hide the inline menu on narrow
  // viewports and collapse to a horizontal scroll-style chip strip
  // instead. Brand + auth pill always render.
  //
  // The Desert theme is CSS-capped to a 540px column on desktop
  // (scripts/inject-pwa-tags.mjs), but useWindowDimensions reports the
  // full window width — so Desert must always use the compact layout
  // regardless of window size, or the menu overflows its column.
  const showMenu = themeId !== 'desert' && width >= 720;
  const styles = makeStyles(theme, themeId, showMenu);
  const userEmail = session?.user?.email ?? null;
  const avatarInitial = (userEmail?.[0] ?? '?').toUpperCase();

  const items = state.routes.map((route, idx) => ({
    key: route.key,
    name: route.name,
    title: ROUTE_TITLES[route.name] ?? route.name,
    active: state.index === idx,
  }));

  // Brand mark varies per theme — rotated red square for Ferrari, rounded
  // coral square for Airtable, oxblood ◆ for Desert.
  const brandLabel =
    themeId === 'ferrari' ? 'PUMP · CORSA' : themeId === 'airtable' ? 'Pump' : 'PUMP';

  return (
    <>
    <View style={styles.bar}>
      <View style={styles.brand}>
        <View style={styles.brandMark} />
        <Text style={styles.brandText}>{brandLabel}</Text>
      </View>

      {showMenu ? (
        <View style={styles.menu}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => {
                if (!it.active) navigation.navigate(it.name as never);
              }}
              style={styles.menuItem}>
              <Text style={[styles.menuText, it.active && styles.menuTextActive]}>
                {it.title}
              </Text>
              {it.active ? <View style={styles.menuUnderline} /> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        // Narrow viewport: horizontally scrollable chip strip. flexShrink
        // lets it give up width to the right-side sign-in pill, and the
        // ScrollView keeps overflow accessible.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.menuMobile}
          style={styles.menuMobileScroll}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => {
                if (!it.active) navigation.navigate(it.name as never);
              }}
              style={[styles.menuMobileItem, it.active && styles.menuMobileItemActive]}>
              <Text
                style={[
                  styles.menuMobileText,
                  it.active && styles.menuMobileTextActive,
                ]}>
                {it.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Auth slot — always visible. Signed out: "Sign in" pill opens
          the SignInPanel. Signed in: avatar with initial; tap opens the
          same panel showing account info + sign out. */}
      <View style={styles.right}>
        {session ? (
          <Pressable
            onPress={() => setPanelOpen(true)}
            style={styles.avatar}
            accessibilityLabel={`Signed in as ${userEmail ?? 'user'}`}>
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          </Pressable>
        ) : themeId === 'airtable' ? (
          <Pressable
            onPress={() => setPanelOpen(true)}
            style={styles.pillFilled}
            accessibilityLabel="Sign in">
            <Text style={styles.pillFilledText}>Sign in</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setPanelOpen(true)}
            style={styles.signInLink}
            accessibilityLabel="Sign in">
            <Text style={styles.rightText}>SIGN IN</Text>
          </Pressable>
        )}
      </View>
    </View>

    {panelOpen ? (
      <SignInPanel
        onClose={() => setPanelOpen(false)}
        onSignOut={async () => {
          await signOut();
          setPanelOpen(false);
        }}
      />
    ) : null}
  </>);
}

function makeStyles({ colors, fonts, space }: Theme, themeId: string, showMenu: boolean) {
  const isFerrari = themeId === 'ferrari';
  const isAirtable = themeId === 'airtable';

  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.lg,
      height: showMenu ? 64 : 56,
      borderBottomWidth: 1,
      borderBottomColor: colors.paperEdge,
      backgroundColor: colors.bg,
      gap: 16,
      zIndex: 50,
    },

    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    brandMark: {
      width: isAirtable ? 18 : 14,
      height: isAirtable ? 18 : 14,
      backgroundColor: colors.rust,
      borderRadius: isAirtable ? 4 : 0,
      transform: isFerrari ? [{ rotate: '45deg' }] : [],
    },
    brandText: {
      fontFamily: fonts.bodyBold,
      fontSize: isAirtable ? 20 : 15,
      color: colors.ink,
      letterSpacing: isAirtable ? -0.4 : 0.5,
      textTransform: isAirtable ? 'none' : 'uppercase',
    },

    menu: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: isAirtable ? 28 : 32,
      marginLeft: isAirtable ? 36 : 48,
      flex: 1,
    },
    menuItem: {
      // Underline sits OUTSIDE the touch area so it doesn't shift on press
      paddingVertical: isFerrari ? 22 : 8,
      position: 'relative',
    },
    menuText: {
      fontFamily: isAirtable ? fonts.body : fonts.bodyBold,
      fontSize: isAirtable ? 14 : 13,
      color: isAirtable ? colors.inkSoft : colors.inkFaint,
      letterSpacing: isAirtable ? -0.1 : 0.65,
      textTransform: isAirtable ? 'none' : 'uppercase',
    },
    menuTextActive: {
      color: colors.ink,
      fontFamily: fonts.bodyBold,
    },
    menuUnderline: isFerrari
      ? {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          backgroundColor: colors.rust,
        }
      : { height: 0, width: 0 },

    // Narrow-viewport menu — horizontally scrollable chip strip. flex 1
    // gives it the leftover width between brand and right-side actions;
    // overflow scrolls horizontally so all routes stay reachable on phones.
    menuMobileScroll: { flex: 1, marginLeft: 8 },
    menuMobile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
    },
    menuMobileItem: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 9999,
    },
    menuMobileItemActive: isAirtable
      ? { backgroundColor: colors.ink }
      : { backgroundColor: colors.rust },
    menuMobileText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    menuMobileTextActive: { color: colors.bg },

    right: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: isAirtable ? 10 : 12,
      marginLeft: 'auto',
    },
    rightText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.inkFaint,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    rightDot: { color: colors.inkFaint, opacity: 0.4, fontSize: 12 },

    pillOutline: {
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.ink,
    },
    pillOutlineText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: colors.ink,
      letterSpacing: -0.1,
    },
    pillFilled: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 9999,
      backgroundColor: colors.ink,
    },
    pillFilledText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: colors.bg,
      letterSpacing: -0.1,
    },
    // Ferrari-mode sign-in link (text only, no pill)
    signInLink: {
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    // Signed-in avatar — circular pill with the user's first initial.
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 9999,
      backgroundColor: colors.rust,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: colors.onRust,
      letterSpacing: 0.2,
    },
  });
}
