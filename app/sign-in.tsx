import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme-provider';

type Step = 'email' | 'otp';

export default function SignInScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitEmail = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed.includes('@') || trimmed.length < 5) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (e) {
      setError(e.message);
      return;
    }
    setEmail(trimmed);
    setStep('otp');
  };

  const submitToken = async () => {
    setError(null);
    const code = token.trim();
    if (code.length < 6) {
      setError('Enter the code from your email.');
      return;
    }
    setLoading(true);
    const { error: e } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    setLoading(false);
    if (e) {
      setError(e.message);
      return;
    }
    router.back();
  };

  const resendCode = async () => {
    setError(null);
    setLoading(true);
    const { error: e } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (e) {
      setError(e.message);
      return;
    }
    setToken('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inner}>
          <View style={styles.brandRule} />
          <Text style={styles.kicker}>{step === 'email' ? 'PUMP · CHECK-IN' : 'VERIFY'}</Text>
          <Text style={styles.title}>
            {step === 'email' ? 'Sign in' : 'Code, please.'}
          </Text>
          <Text style={styles.subtle}>
            {step === 'email'
              ? 'one-time code by email. no password — we keep it light.'
              : `code sent to ${email}.`}
          </Text>

          {step === 'email' ? (
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={submitEmail}
            />
          ) : (
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="12345678"
              placeholderTextColor={colors.inkFaint}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              value={token}
              onChangeText={setToken}
              editable={!loading}
              autoFocus
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={submitToken}
            />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              loading && styles.buttonDisabled,
              pressed && !loading && styles.buttonPressed,
            ]}
            onPress={step === 'email' ? submitEmail : submitToken}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.amber} />
            ) : (
              <Text style={styles.buttonText}>
                {step === 'email' ? 'SEND CODE' : 'VERIFY'}
              </Text>
            )}
          </Pressable>

          {step === 'otp' && !loading ? (
            <View style={styles.otpFooter}>
              <Pressable onPress={resendCode} style={styles.linkRow}>
                <Text style={styles.link}>resend code</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep('email');
                  setToken('');
                  setError(null);
                }}
                style={styles.linkRow}>
                <Text style={styles.link}>different email</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, radius, space }: Theme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  inner: { flex: 1, padding: 24, justifyContent: 'flex-start' },
  brandRule: { width: 36, height: 2, backgroundColor: colors.rust, marginBottom: 14 },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.rust,
    letterSpacing: 4,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    color: colors.ink,
    lineHeight: 42,
  },
  subtle: {
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
    color: colors.inkSoft,
    marginTop: 6,
    marginBottom: space.xl,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.dust,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    backgroundColor: colors.paper,
    color: colors.ink,
  },
  otpInput: {
    fontFamily: fonts.numeral,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    marginTop: 12,
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.ink,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: colors.amber,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 3,
  },
  linkRow: { marginTop: 16, alignItems: 'center' },
  link: {
    color: colors.rust,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  otpFooter: { flexDirection: 'row', justifyContent: 'space-around', gap: 16 },
});
}
