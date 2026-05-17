import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { formatPriceCents } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, space } from '@/lib/theme';
import type { Octane } from '@/lib/types';

type ParsedPrice = { octane: Octane; price_cents: number };

type ReportResponse = {
  report_id: string;
  parsed_prices: ParsedPrice[];
};

export default function UploadScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ stationId?: string; stationLabel?: string }>();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPrice[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const capture = async () => {
    setMessage(null);
    setParsed(null);

    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (camPerm.status !== 'granted') {
      setMessage('Camera permission denied');
      return;
    }
    const locPerm = await Location.requestForegroundPermissionsAsync();
    if (locPerm.status !== 'granted') {
      setMessage('Location permission needed to attach to a station');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: false,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    setSubmitting(true);

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const file = await fetch(uri);
      const blob = await file.blob();

      const path = `crowd/${session?.user?.id ?? 'anon'}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('reports').upload(path, blob, {
        contentType: 'image/jpeg',
      });
      if (upErr) throw upErr;

      const { data, error: fnErr } = await supabase.functions.invoke<ReportResponse>('report', {
        body: {
          photo_path: path,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          ...(params.stationId ? { station_id: params.stationId } : {}),
        },
      });
      if (fnErr) throw fnErr;
      setParsed(data?.parsed_prices ?? []);
      if (params.stationId) {
        router.setParams({ stationId: '', stationLabel: '' });
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.brandRule} />
      <Text style={styles.kicker}>CITIZEN · CONTRIBUTOR</Text>
      <Text style={styles.title}>Report a price</Text>
      <Text style={styles.subtitle}>
        snap the price sign. we&apos;ll read the four octane numbers and file
        them with your fellow drivers.
      </Text>
      {params.stationLabel ? (
        <View style={styles.stationPill}>
          <Text style={styles.stationPillText}>
            FOR · {params.stationLabel.toUpperCase()}
          </Text>
        </View>
      ) : null}

      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}

      {submitting && (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.rust} />
      )}

      {parsed && (
        <View style={styles.parsedBlock}>
          <Text style={styles.parsedHeader}>DETECTED PRICES</Text>
          {parsed.length === 0 ? (
            <Text style={styles.muted}>
              couldn&apos;t read any prices. try a clearer photo.
            </Text>
          ) : (
            parsed.map((p) => (
              <View key={p.octane} style={styles.parsedRow}>
                <Text style={styles.parsedOctane}>{p.octane}</Text>
                <Text style={styles.parsedPrice}>{formatPriceCents(p.price_cents)}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {message ? (
        <View style={styles.messageBlock}>
          <Text style={styles.error}>{message}</Text>
          {message.toLowerCase().includes('permission') ? (
            <Pressable style={styles.settingsLink} onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsLinkText}>OPEN SETTINGS</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.btnPressed]}
        onPress={capture}
        disabled={submitting}>
        <Text style={styles.buttonText}>
          {photoUri ? 'TAKE ANOTHER' : 'TAKE A PHOTO'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.lg, backgroundColor: colors.bg },
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
    fontSize: 32,
    color: colors.ink,
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    color: colors.inkSoft,
    fontSize: 14,
    marginTop: 6,
    marginBottom: space.lg,
    lineHeight: 20,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.paperEdge,
  },
  parsedBlock: {
    marginTop: 16,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },
  parsedHeader: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.amber,
    letterSpacing: 3,
    marginBottom: 10,
  },
  parsedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 136, 44, 0.15)',
  },
  parsedOctane: {
    fontFamily: fonts.priceHeavy,
    fontSize: 18,
    color: colors.paper,
  },
  parsedPrice: {
    fontFamily: fonts.priceHeavy,
    fontSize: 22,
    color: colors.amber,
  },
  muted: {
    color: colors.inkFaint,
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    marginTop: 12,
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
  },
  button: {
    marginTop: space.xl,
    backgroundColor: colors.ink,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  buttonText: {
    color: colors.amber,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 3,
  },
  stationPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: colors.rust,
    marginBottom: 12,
  },
  stationPillText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 2,
  },
  messageBlock: { marginTop: 12, alignItems: 'flex-start' },
  settingsLink: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.rust,
  },
  settingsLinkText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 2,
  },
});
