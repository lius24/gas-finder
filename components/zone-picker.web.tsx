import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius as radii, space } from '@/lib/theme';

export function ZonePicker() {
  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>
        Zone editing is coming to web in v1.1. Sign in on the iOS or Android app to
        edit your refresh zone, or wait for the next release.
      </Text>
      <Text style={styles.muted}>
        For now, web uses the default ingest footprint (Troy NY, Phoenix, Sedona,
        Flagstaff).
      </Text>
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
    gap: 8,
  },
  subtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  muted: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkSoft,
  },
});
