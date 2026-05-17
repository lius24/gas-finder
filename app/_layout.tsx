import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
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
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

const PaperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.paper,
    text: colors.ink,
    border: colors.paperEdge,
    primary: colors.rust,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium_Italic,
    Fraunces_700Bold,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Newsreader_700Bold,
    MajorMonoDisplay_400Regular,
    JetBrainsMono_800ExtraBold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : PaperTheme}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.bg },
            headerStyle: { backgroundColor: colors.bg },
            headerTitleStyle: { fontFamily: 'Fraunces_700Bold', fontSize: 18 },
            headerTintColor: colors.rust,
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="station/[id]" options={{ title: 'Station' }} />
          <Stack.Screen
            name="sign-in"
            options={{ title: 'Sign in', presentation: 'modal' }}
          />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </AuthProvider>
  );
}
