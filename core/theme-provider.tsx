// ThemeProvider — owns the active theme, persists the chosen id, and
// exposes useTheme() + useThemeId() + useSetTheme() to consumers.
//
// The active theme id is mirrored onto `<html data-theme>`; the per-theme
// CSS custom properties in src/styles/themes.css key off that attribute.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { storage } from './adapters/storage';
import { DEFAULT_THEME_ID, isThemeId, THEMES, type Theme, type ThemeId } from './theme';

const THEME_KEY = 'preferences.theme';

type ThemeContextValue = {
  theme: Theme;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyDataTheme(id: ThemeId) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = id;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage
      .getItem(THEME_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (isThemeId(raw)) setThemeIdState(raw);
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
    storage.setItem(THEME_KEY, id).catch(() => {});
  }, []);

  useEffect(() => {
    applyDataTheme(themeId);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: THEMES[themeId], themeId, setTheme, ready }),
    [themeId, setTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
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

export function useThemeReady(): boolean {
  const ctx = useContext(ThemeContext);
  return ctx ? ctx.ready : true;
}
