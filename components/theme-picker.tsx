import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { THEMES, type Theme, type ThemeId } from '@/lib/theme';
import { useSetTheme, useTheme, useThemeId } from '@/lib/theme-provider';

const THEME_ORDER: ThemeId[] = ['desert', 'ferrari', 'airtable'];

const THEME_DESCRIPTIONS: Record<ThemeId, string> = {
  desert: 'Cream paper, oxblood signage, amber pump-display digits. The original.',
  ferrari: 'Near-black canvas, Outfit display type, Rosso Corsa as scarce accent.',
  airtable: 'White canvas, Archivo grotesk, signature-coral accent. Editorial.',
};

/**
 * Swatch row for a single theme — three color chips + a sample brand line.
 * Tappable; the active theme gets a thick rust border.
 */
export function ThemePicker() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const activeId = useThemeId();
  const setTheme = useSetTheme();

  return (
    <View style={styles.list}>
      {THEME_ORDER.map((id) => {
        const t = THEMES[id];
        const active = id === activeId;
        return (
          <Pressable
            key={id}
            onPress={() => {
              if (!active) Haptics.selectionAsync();
              setTheme(id);
            }}
            style={({ pressed }) => [
              styles.row,
              active && styles.rowActive,
              pressed && styles.rowPressed,
            ]}>
            <View style={styles.swatchRow}>
              <View style={[styles.swatch, { backgroundColor: t.colors.bg }]} />
              <View style={[styles.swatch, { backgroundColor: t.colors.paper }]} />
              <View style={[styles.swatch, { backgroundColor: t.colors.rust }]} />
              <View style={[styles.swatch, { backgroundColor: t.colors.amber }]} />
              <View style={[styles.swatch, { backgroundColor: t.colors.ink }]} />
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{t.name}</Text>
                {active ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
              </View>
              <Text style={styles.desc}>{THEME_DESCRIPTIONS[id]}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles({ colors, fonts, radius, space }: Theme) {
  return StyleSheet.create({
    list: {
      gap: space.sm,
    },
    row: {
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.md,
    },
    rowActive: {
      borderColor: colors.rust,
      borderWidth: 1.5,
    },
    rowPressed: { opacity: 0.85 },
    swatchRow: {
      flexDirection: 'row',
      gap: 6,
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },
    body: {
      gap: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 18,
      color: colors.ink,
      letterSpacing: 0.5,
    },
    activeBadge: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      color: colors.rust,
      letterSpacing: 2,
    },
    desc: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
      lineHeight: 18,
    },
  });
}
