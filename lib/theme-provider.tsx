// ThemeProvider — owns the active theme, persists the chosen id, and
// exposes useTheme() + useThemeId() + setTheme() to consumers.
//
// First-paint behavior: on app launch we synchronously render with the
// DEFAULT_THEME_ID until AsyncStorage returns the persisted choice
// (typically ~30ms on web/localStorage, slightly more on native). The
// existing splash screen covers this window so users don't see a flash.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_THEME_ID, THEMES, type Theme, type ThemeId } from './theme';

const THEME_KEY = 'preferences.theme';

type ThemeContextValue = {
  theme: Theme;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isValidId(x: unknown): x is ThemeId {
  return x === 'desert' || x === 'ferrari' || x === 'airtable';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (isValidId(raw)) setThemeIdState(raw);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    AsyncStorage.setItem(THEME_KEY, id).catch(() => {});
  }, []);

  // Expose the active theme to the static page shell as `<html data-theme>`.
  // The PWA-injected CSS (scripts/inject-pwa-tags.mjs) uses it to constrain
  // the Desert layout to a phone-width column on desktop while leaving the
  // full-bleed Ferrari/Airtable themes uncapped. Web-only; no-op on native.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = themeId;
    }
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: THEMES[themeId], themeId, setTheme, ready }),
    [themeId, setTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  // Fallback to default theme when called outside the provider — keeps
  // unit tests / Storybook-style harnesses simple, and means the desert
  // tokens still flow even if a screen happens to render pre-provider.
  return ctx ? ctx.theme : THEMES[DEFAULT_THEME_ID];
}

export function useThemeId(): ThemeId {
  const ctx = useContext(ThemeContext);
  return ctx ? ctx.themeId : DEFAULT_THEME_ID;
}

export function useSetTheme(): (id: ThemeId) => void {
  const ctx = useContext(ThemeContext);
  return ctx ? ctx.setTheme : () => {};
}
