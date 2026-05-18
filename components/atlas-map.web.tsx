import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, space } from '@/lib/theme';

export default function AtlasMapWeb() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.center}>
        <Text style={styles.kicker}>ATLAS · COMING SOON</Text>
        <Text style={styles.title}>Map view</Text>
        <Text style={styles.body}>
          The interactive map is coming to web in v1.1 via MapLibre GL JS. For now,
          use the Pumps tab to find stations near you.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: 8,
  },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.rust,
    letterSpacing: 4,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: colors.ink,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 20,
  },
});
