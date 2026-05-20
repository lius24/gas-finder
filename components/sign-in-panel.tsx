// Modal sign-in panel triggered from the top nav bar. Three modes:
//   1) signed out + email step  — enter email → sends magic link/OTP
//   2) signed out + OTP step    — paste the 6-digit code → exchange for session
//   3) signed in                — show account email + Sign out + Account links
//
// Google OAuth is offered alongside email when supabase.auth.signInWithOAuth
// is reachable. If the Google provider isn't enabled on the Supabase project,
// the underlying call returns a helpful error and we surface it inline.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

type Props = {
  onClose: () => void;
  onSignOut: () => Promise<void>;
};

export function SignInPanel({ onClose, onSignOut }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme, width), [theme, width]);
  const { colors } = theme;
  const { session } = useAuth();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submitEmail = async () => {
    setError(null);
    setNotice(null);
    const trimmed = email.trim();
    if (!trimmed.includes('@') || trimmed.length < 5) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });
      if (err) {
        setError(err.message);
        return;
      }
      setStep('otp');
      setNotice(`We sent a 6-digit code to ${trimmed}.`);
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    setError(null);
    setNotice(null);
    const trimmed = otp.trim();
    if (trimmed.length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: trimmed,
        type: 'email',
      });
      if (err) {
        setError(err.message);
        return;
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      // Redirect back to the home screen after the OAuth round-trip.
      // On native the redirect goes through a deep-link scheme; we leave
      // the default Supabase redirect handling in place for now.
      const redirectTo =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : undefined;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (err) {
        // Most common failure: the Google provider isn't enabled in the
        // Supabase dashboard yet. Surface a helpful note instead of the
        // raw error so the user knows where to look.
        if (/provider/i.test(err.message) || /not enabled/i.test(err.message)) {
          setError(
            "Google sign-in isn't enabled yet. Enable it in Supabase Dashboard → Auth → Providers → Google.",
          );
        } else {
          setError(err.message);
        }
        setLoading(false);
        return;
      }
      // On web, signInWithOAuth navigates away — no further work here.
      // The onAuthStateChange listener in AuthProvider picks up the
      // session when we return.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  return (
    <View style={styles.scrim} pointerEvents="auto">
      <Pressable style={styles.scrimBackdrop} onPress={onClose} />
      <View style={styles.panel}>
        <View style={styles.head}>
          <Text style={styles.title}>
            {session ? 'Your account' : 'Sign in to Pump'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.inkSoft} />
          </Pressable>
        </View>

        {session ? (
          <View style={styles.body}>
            <Text style={styles.lede}>
              You&apos;re signed in as{' '}
              <Text style={styles.ledeStrong}>{session.user.email}</Text>.
            </Text>
            <Pressable
              style={styles.outlineBtn}
              onPress={async () => {
                await onSignOut();
              }}>
              <Text style={styles.outlineBtnText}>Sign out</Text>
            </Pressable>
          </View>
        ) : step === 'email' ? (
          <View style={styles.body}>
            <Text style={styles.lede}>
              Save favorites, get price alerts, and sync across devices.
            </Text>

            <Pressable
              style={[styles.googleBtn, loading && styles.disabled]}
              onPress={signInWithGoogle}
              disabled={loading}>
              <View style={styles.googleMark}>
                <Text style={styles.googleMarkText}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or email</Text>
              <View style={styles.dividerLine} />
            </View>

            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkFaint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={submitEmail}
              editable={!loading}
            />
            <Pressable
              style={[styles.primaryBtn, loading && styles.disabled]}
              onPress={submitEmail}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color={colors.onRust} />
              ) : (
                <Text style={styles.primaryBtnText}>Send code</Text>
              )}
            </Pressable>

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.body}>
            <Text style={styles.lede}>
              {notice ?? `Check your email for the 6-digit code we sent to ${email}.`}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={colors.inkFaint}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={submitOtp}
              editable={!loading}
            />
            <Pressable
              style={[styles.primaryBtn, loading && styles.disabled]}
              onPress={submitOtp}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color={colors.onRust} />
              ) : (
                <Text style={styles.primaryBtnText}>Verify & sign in</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setStep('email');
                setOtp('');
                setError(null);
                setNotice(null);
              }}
              style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>← Use a different email</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

function makeStyles({ colors, fonts, radius, space }: Theme, width: number) {
  const isNarrow = width < 720;
  return StyleSheet.create({
    scrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 200,
      // Center on desktop, slide-up-from-bottom feel on phones via
      // justifyContent: 'flex-end'. We approximate "modal" without
      // expo-modal because RN-web's <Modal> is flaky in PWA mode.
      justifyContent: isNarrow ? 'flex-end' : 'center',
      alignItems: 'center',
    },
    scrimBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    panel: {
      backgroundColor: colors.bg,
      borderRadius: isNarrow ? 0 : radius.xl,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      width: isNarrow ? '100%' : 440,
      maxWidth: '100%',
      paddingHorizontal: space.xl,
      paddingTop: 20,
      paddingBottom: 32,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: '0 30px 60px rgba(0,0,0,0.25)' } as any)
        : null),
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 24,
      color: colors.ink,
      letterSpacing: -0.5,
      fontWeight: '600',
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
    },

    body: { gap: 14 },
    lede: {
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
      color: colors.inkSoft,
    },
    ledeStrong: { color: colors.ink, fontFamily: fonts.bodyBold },

    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      backgroundColor: colors.paper,
    },
    googleMark: {
      width: 22,
      height: 22,
      borderRadius: 9999,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#dadce0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleMarkText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: '#4285F4',
    },
    googleBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: colors.ink,
      letterSpacing: -0.1,
    },

    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 4,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.paperEdge },
    dividerText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.inkFaint,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },

    input: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 9999,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.paperEdge,
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.ink,
    },
    primaryBtn: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 9999,
      backgroundColor: colors.rust,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: colors.onRust,
      letterSpacing: -0.1,
    },
    outlineBtn: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.ink,
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    outlineBtnText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: colors.ink,
      letterSpacing: -0.1,
    },
    linkBtn: { alignItems: 'flex-start', paddingVertical: 4 },
    linkBtnText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: colors.inkSoft,
    },
    disabled: { opacity: 0.6 },

    notice: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.inkSoft,
      lineHeight: 18,
    },
    error: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: colors.danger,
      lineHeight: 18,
    },
  });
}
