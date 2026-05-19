import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

// "How the math works" — explains the decision-math formula in plain
// language. Worked example uses the founder's original Sunoco vs Stewart's
// comparison from the design doc so the numbers are real and verifiable.
export default function AboutScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>METHODOLOGY · TRUST</Text>
        <Text style={styles.title}>
          Why the math <Text style={styles.titleEm}>actually</Text> matters.
        </Text>
        <Text style={styles.lede}>
          A station listed as "cheaper" isn't always cheaper after you account for the
          cost of driving farther. Pump computes the net savings — every time, on every
          card — so you don't have to do the math in your head.
        </Text>

        <View style={styles.grid}>
          <View style={styles.gridCell}>
            <Text style={styles.gridNum}>$0.16</Text>
            <Text style={styles.gridTitle}>Price difference / gallon</Text>
            <Text style={styles.gridBody}>
              The sign-readable savings. Looks great in a list. Tells half the story.
            </Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={styles.gridNum}>3.6 mi</Text>
            <Text style={styles.gridTitle}>Extra round-trip distance</Text>
            <Text style={styles.gridBody}>
              The cost of getting to the "cheaper" station and back. Haversine straight-
              line × 1.3 for road correction.
            </Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={styles.gridNumAccent}>$1.27</Text>
            <Text style={styles.gridTitle}>Actual net savings</Text>
            <Text style={styles.gridBody}>
              Gross savings minus drive cost. What the math tells you that the list
              doesn't.
            </Text>
          </View>
        </View>

        <View style={styles.formulaCard}>
          <Text style={styles.formulaLabel}>THE FORMULA</Text>
          <Text style={styles.formula}>
            net_savings ={'\n'}
            {'  '}(baseline_price − station_price) × tank_size{'\n'}
            {'  '}− (extra_round_trip_miles / mpg) × station_price
          </Text>
        </View>

        <Text style={styles.sectionHeader}>Worked example · Troy, NY</Text>
        <View style={styles.example}>
          <Text style={styles.exampleStep}>
            <Text style={styles.exampleStepLabel}>Closest pump · </Text>
            Stewart's at 0.5 mi pumping 91 octane at $5.66.
          </Text>
          <Text style={styles.exampleStep}>
            <Text style={styles.exampleStepLabel}>Candidate · </Text>
            Sunoco at 2.0 mi pumping 93 octane at $5.30.
          </Text>
          <Text style={styles.exampleStep}>
            <Text style={styles.exampleStepLabel}>Gross savings · </Text>
            ($5.66 − $5.30) × 12 gal = <Text style={styles.exampleNum}>$4.32</Text>.
          </Text>
          <Text style={styles.exampleStep}>
            <Text style={styles.exampleStepLabel}>Drive cost · </Text>
            (3.6 mi extra round-trip / 25 mpg) × $5.30 ={' '}
            <Text style={styles.exampleNum}>$0.76</Text>.
          </Text>
          <Text style={styles.exampleStepLast}>
            <Text style={styles.exampleStepLabel}>Net savings · </Text>
            <Text style={styles.exampleNetNum}>$3.56 (≈$1.27 after octane mismatch)</Text>
          </Text>
        </View>

        <Text style={styles.sectionHeader}>What about the range?</Text>
        <Text style={styles.body}>
          Pump renders savings as a range — "Save $0.80–$1.40" — because the math
          assumes a 12-gallon tank and 25 mpg. Your car probably isn't exactly those
          numbers. The ±25% range absorbs the assumption. A custom-input version is on
          the v1.1 roadmap.
        </Text>

        <Text style={styles.sectionHeader}>What about stale prices?</Text>
        <Text style={styles.body}>
          Every reading is timestamped by Google Places. Readings &gt; 24 hours old are
          marked "stale"; readings &gt; 7 days old are hidden entirely. The product's
          "authoritative not user-reported" promise depends on this being visible, not
          hidden.
        </Text>

        <Text style={styles.sectionHeader}>What about the data source?</Text>
        <Text style={styles.body}>
          Every price is pulled live from Google Places fuelOptions — the same data
          your car's nav system reads. No crowd-reported submissions, no app prompts,
          no "tap to confirm this is still accurate." Just the timestamp the pump
          itself sent.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, radius, space }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, paddingBottom: space.xxl * 2 },

    kicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.rust,
      letterSpacing: 3,
      marginBottom: 8,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 36,
      color: colors.ink,
      lineHeight: 40,
      letterSpacing: -0.5,
    },
    titleEm: {
      fontFamily: fonts.displayItalic,
      color: colors.rust,
    },
    lede: {
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.inkSoft,
      lineHeight: 24,
      marginTop: space.md,
      marginBottom: space.xl,
    },

    grid: {
      gap: space.sm,
      marginBottom: space.xl,
    },
    gridCell: {
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      borderRadius: radius.lg,
      padding: space.lg,
    },
    gridNum: {
      fontFamily: fonts.display,
      fontSize: 32,
      color: colors.ink,
      lineHeight: 34,
      marginBottom: 4,
      letterSpacing: -0.5,
    },
    gridNumAccent: {
      fontFamily: fonts.display,
      fontSize: 32,
      color: colors.rust,
      lineHeight: 34,
      marginBottom: 4,
      letterSpacing: -0.5,
    },
    gridTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: colors.ink,
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    gridBody: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
      lineHeight: 19,
    },

    formulaCard: {
      backgroundColor: colors.ink,
      borderRadius: radius.lg,
      padding: space.lg,
      marginBottom: space.xl,
    },
    formulaLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: colors.amber,
      letterSpacing: 2,
      marginBottom: 10,
    },
    formula: {
      fontFamily: fonts.numeral,
      fontSize: 13,
      color: colors.paper,
      lineHeight: 22,
    },

    sectionHeader: {
      fontFamily: fonts.display,
      fontSize: 20,
      color: colors.ink,
      letterSpacing: 0.2,
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkSoft,
      lineHeight: 22,
      marginBottom: space.md,
    },

    example: {
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      borderRadius: radius.lg,
      padding: space.lg,
      marginBottom: space.md,
      gap: 8,
    },
    exampleStep: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkSoft,
      lineHeight: 22,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.paperEdge,
    },
    exampleStepLast: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.inkSoft,
      lineHeight: 22,
    },
    exampleStepLabel: {
      fontFamily: fonts.bodyBold,
      color: colors.ink,
    },
    exampleNum: {
      fontFamily: fonts.bodyBold,
      color: colors.ink,
    },
    exampleNetNum: {
      fontFamily: fonts.bodyBold,
      color: colors.rust,
      fontSize: 15,
    },
  });
}
