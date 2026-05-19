// Web-only custom top tab bar that doubles as the marketing nav strip
// shown in the Ferrari + Airtable previews. Renders brand-mark left, the
// route menu (Pumps · Atlas · Report · Garage) center/inline, and theme-
// appropriate right-side actions (Sign in / Get started on Airtable,
// EN-US · Sign in on Ferrari).
//
// Mounted via Tabs.tabBar in app/(tabs)/_layout.tsx on web. Native still
// uses Expo Router's default bottom tab bar — see _layout.tsx.

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Theme } from '@/lib/theme';
import { useTheme, useThemeId } from '@/lib/theme-provider';

const ROUTE_TITLES: Record<string, string> = {
  index: 'Pumps',
  map: 'Atlas',
  upload: 'Report',
  settings: 'Garage',
};

export function ThemeNavBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const themeId = useThemeId();
  const { width } = useWindowDimensions();
  // Mirror the preview's media query: hide the inline menu on narrow
  // viewports; the user reaches routes via the bottom hamburger… well,
  // we don't have one yet, so we collapse to a horizontal scroll-style
  // chip strip instead. Brand + actions always render.
  const showMenu = width >= 720;
  const styles = makeStyles(theme, themeId, showMenu);

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
        // Narrow viewport: minimal chip strip so the user can still
        // navigate between routes. Brand stays left, actions stay right.
        <View style={styles.menuMobile}>
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
        </View>
      )}

      {showMenu ? (
        <View style={styles.right}>
          {themeId === 'airtable' ? (
            <>
              <View style={styles.pillOutline}>
                <Text style={styles.pillOutlineText}>Sign in</Text>
              </View>
              <View style={styles.pillFilled}>
                <Text style={styles.pillFilledText}>Get started</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.rightText}>EN-US</Text>
              <Text style={styles.rightDot}>·</Text>
              <Text style={styles.rightText}>SIGN IN</Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
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

    // Narrow-viewport menu — compact chip strip on the right edge of the bar
    menuMobile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 'auto',
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
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 9999,
      backgroundColor: colors.ink,
    },
    pillFilledText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: colors.bg,
      letterSpacing: -0.1,
    },
  });
}
