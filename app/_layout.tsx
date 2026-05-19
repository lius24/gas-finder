import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
import {
  Archivo_400Regular,
  Archivo_400Regular_Italic,
  Archivo_500Medium,
  Archivo_500Medium_Italic,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  Fraunces_400Regular,
  Fraunces_500Medium_Italic,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { JetBrainsMono_800ExtraBold } from '@expo-google-fonts/jetbrains-mono';
import { MajorMonoDisplay_400Regular } from '@expo-google-fonts/major-mono-display';
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_700Bold,
} from '@expo-google-fonts/newsreader';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/lib/theme-provider';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function ThemedShell() {
  const theme = useTheme();
  const navTheme = useMemo(
    () => ({
      ...(theme.scheme === 'dark' ? DarkTheme : DefaultTheme),
      colors: {
        ...(theme.scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
        background: theme.colors.bg,
        card: theme.colors.paper,
        text: theme.colors.ink,
        border: theme.colors.paperEdge,
        primary: theme.colors.rust,
      },
    }),
    [theme],
  );
  return (
    <NavThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.bg },
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTitleStyle: { fontFamily: theme.fonts.display, fontSize: 18 },
          headerTintColor: theme.colors.rust,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="station/[id]" options={{ title: 'Station' }} />
        <Stack.Screen name="about" options={{ title: 'How the math works' }} />
        <Stack.Screen
          name="sign-in"
          options={{ title: 'Sign in', presentation: 'modal' }}
        />
      </Stack>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    // Desert theme fonts
    Fraunces_400Regular,
    Fraunces_500Medium_Italic,
    Fraunces_700Bold,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Newsreader_700Bold,
    MajorMonoDisplay_400Regular,
    JetBrainsMono_800ExtraBold,
    // Ferrari theme fonts
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    // Airtable theme fonts
    Archivo_400Regular,
    Archivo_400Regular_Italic,
    Archivo_500Medium,
    Archivo_500Medium_Italic,
    Archivo_600SemiBold,
    Archivo_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <ThemeProvider>
        <ThemedShell />
      </ThemeProvider>
    </AuthProvider>
  );
}
