import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registrationInFlight: Promise<string | null> | null = null;

// Registers this device for push and persists the token under the signed-in
// user. Idempotent and safe to call on every app launch — each call upserts
// last_seen_at so stale tokens can be reaped later.
export async function registerForPushAlerts(userId: string): Promise<string | null> {
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('price-alerts', {
          name: 'Price alerts',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== 'granted') return null;

      const projectId =
        (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
          ?.projectId ??
        (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

      // expo-notifications v0.32+ requires projectId on standalone/dev builds.
      // In Expo Go it'll fall back to the legacy push service.
      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      const token = tokenResult.data;
      if (!token) return null;

      const platform: 'ios' | 'android' | 'web' =
        Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

      await supabase.from('device_tokens').upsert(
        {
          user_id: userId,
          expo_push_token: token,
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_push_token' },
      );

      return token;
    } catch {
      return null;
    } finally {
      registrationInFlight = null;
    }
  })();

  return registrationInFlight;
}
