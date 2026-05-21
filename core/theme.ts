// Theme registry. The web app ships two themes (eng-review decision D1):
//   - ferrari  (Edizione Corsa — near-black canvas, Rosso Corsa accent)
//   - airtable (Editorial — white canvas, signature-coral, sidebar layout)
//
// Desert was dropped from web and deferred to a future native app.
//
// Token VALUES (color / spacing / type) live in CSS custom properties under
// `[data-theme="..."]` (src/styles/themes.css), not in JS — that is the
// migration's structural win over the RN-Web token objects this replaces.
// This module is only the id/name registry the ThemeProvider and the theme
// picker need.

export type ThemeId = 'ferrari' | 'airtable';

export type Theme = {
  id: ThemeId;
  name: string;
  scheme: 'light' | 'dark';
};

export const THEMES: Record<ThemeId, Theme> = {
  ferrari: { id: 'ferrari', name: 'Edizione Corsa', scheme: 'dark' },
  airtable: { id: 'airtable', name: 'Editorial', scheme: 'light' },
};

export const THEME_IDS: ThemeId[] = ['ferrari', 'airtable'];

export const DEFAULT_THEME_ID: ThemeId = 'ferrari';

export function isThemeId(x: unknown): x is ThemeId {
  return x === 'ferrari' || x === 'airtable';
}
