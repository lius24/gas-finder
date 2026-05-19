// Theme tokens & registry. Three themes ship in v1:
//   - desert  (Desert Refueling Station — original, default)
//   - ferrari (Edizione Corsa — near-black + Rosso Corsa)
//   - airtable (Editorial — white + signature-coral)
//
// Token surface is identical across themes so every consumer can call
// useTheme() and swap. Layout is *not* themed; only colors, fonts, radius,
// space, shadow. The previews under /preview/<theme>.html show the layout
// overhaul; this in-app theme is the token-level approximation.
//
// Top-level `colors / fonts / radius / space / shadow / fontSizes` exports
// remain as the desert defaults so non-migrated files keep working until
// they switch to useTheme().

export type ThemeId = 'desert' | 'ferrari' | 'airtable';

export type ThemeColors = {
  bg: string;
  paper: string;
  paperEdge: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  rust: string;
  rustDark: string;
  amber: string;
  amberDark: string;
  moss: string;
  sand: string;
  dust: string;
  cactus: string;
  danger: string;
  good: string;
  shadow: string;
};

export type ThemeFonts = {
  display: string;
  displayRegular: string;
  displayItalic: string;
  body: string;
  bodyMedium: string;
  bodyBold: string;
  bodyItalic: string;
  numeral: string;
  priceHeavy: string;
};

export type ThemeShadow = {
  card: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
  panel: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
};

export type ThemeRadius = { sm: number; md: number; lg: number; xl: number };
export type ThemeSpace = { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
export type ThemeFontSizes = { xs: number; sm: number; base: number; md: number; lg: number; xl: number; xxl: number; display: number };

export type Theme = {
  id: ThemeId;
  name: string;
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  fonts: ThemeFonts;
  fontSizes: ThemeFontSizes;
  space: ThemeSpace;
  radius: ThemeRadius;
  shadow: ThemeShadow;
};

export const fontSizes = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Per-theme radius scales — Ferrari + Airtable both prefer sharper edges.
const desertRadius = { sm: 6, md: 10, lg: 14, xl: 20 } as const;
const ferrariRadius = { sm: 0, md: 0, lg: 2, xl: 4 } as const;
const airtableRadius = { sm: 6, md: 10, lg: 18, xl: 24 } as const;

// Default top-level `radius` export stays desert for backward compat.
export const radius = desertRadius;

// -- Desert (default, current Desert Refueling Station system) ------------
const desertColors: ThemeColors = {
  bg: '#F4EFE6',
  paper: '#FBF6ED',
  paperEdge: '#EDE5D2',
  ink: '#1C1814',
  inkSoft: '#5C544A',
  inkFaint: '#9A8E7C',
  rust: '#8B2E1B',
  rustDark: '#651E10',
  amber: '#D4882C',
  amberDark: '#A4651E',
  moss: '#4A5D3E',
  sand: '#D9CFB8',
  dust: '#C4B89F',
  cactus: '#7B8B6F',
  danger: '#A52B1A',
  good: '#4A5D3E',
  shadow: 'rgba(40, 28, 16, 0.10)',
};

const desertFonts: ThemeFonts = {
  display: 'Fraunces_700Bold',
  displayRegular: 'Fraunces_400Regular',
  displayItalic: 'Fraunces_500Medium_Italic',
  body: 'Newsreader_400Regular',
  bodyMedium: 'Newsreader_500Medium',
  bodyBold: 'Newsreader_700Bold',
  bodyItalic: 'Newsreader_400Regular_Italic',
  numeral: 'MajorMonoDisplay_400Regular',
  priceHeavy: 'JetBrainsMono_800ExtraBold',
};

const desertShadow: ThemeShadow = {
  card: {
    shadowColor: '#28190C',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  panel: {
    shadowColor: '#28190C',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

// -- Ferrari (Edizione Corsa — near-black canvas, Rosso Corsa as accent) --
const ferrariColors: ThemeColors = {
  bg: '#181818',
  paper: '#202020',
  paperEdge: '#303030',
  ink: '#ffffff',
  inkSoft: '#c8c8c8',
  inkFaint: '#969696',
  rust: '#da291c',
  rustDark: '#b01e0a',
  amber: '#ffffff',     // No separate amber — Ferrari's only voltage is Rosso; price digits read in white
  amberDark: '#d9d9d9',
  moss: '#3a8a3a',
  sand: '#404040',
  dust: '#404040',
  cactus: '#5a5a5a',
  danger: '#f13a2c',
  good: '#03904a',
  shadow: 'rgba(0, 0, 0, 0.45)',
};

const ferrariFonts: ThemeFonts = {
  display: 'Outfit_600SemiBold',
  displayRegular: 'Outfit_400Regular',
  displayItalic: 'Outfit_400Regular',
  body: 'Outfit_400Regular',
  bodyMedium: 'Outfit_500Medium',
  bodyBold: 'Outfit_700Bold',
  bodyItalic: 'Outfit_400Regular',
  numeral: 'Outfit_500Medium',
  priceHeavy: 'Outfit_700Bold',
};

const ferrariShadow: ThemeShadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  panel: {
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
};

// -- Airtable (Editorial — white canvas, signature-coral + Archivo) -------
const airtableColors: ThemeColors = {
  bg: '#ffffff',
  paper: '#ffffff',
  paperEdge: '#dddddd',
  ink: '#181d26',
  inkSoft: '#333840',
  inkFaint: '#5a606b',
  rust: '#aa2d00',       // signature-coral as the rust slot
  rustDark: '#7a2000',
  amber: '#d9a441',      // signature-mustard as the amber slot
  amberDark: '#9c7224',
  moss: '#0a2e0e',       // signature-forest
  sand: '#f5e9d4',       // signature-cream
  dust: '#dddddd',
  cactus: '#a8d8c4',     // signature-mint
  danger: '#aa2d00',
  good: '#0a2e0e',
  shadow: 'rgba(24, 29, 38, 0.08)',
};

const airtableFonts: ThemeFonts = {
  display: 'Archivo_600SemiBold',
  displayRegular: 'Archivo_400Regular',
  displayItalic: 'Archivo_500Medium_Italic',
  body: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodyBold: 'Archivo_700Bold',
  bodyItalic: 'Archivo_400Regular_Italic',
  numeral: 'Archivo_500Medium',
  priceHeavy: 'Archivo_700Bold',
};

const airtableShadow: ThemeShadow = {
  card: {
    shadowColor: '#181d26',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  panel: {
    shadowColor: '#181d26',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
};

export const THEMES: Record<ThemeId, Theme> = {
  desert: {
    id: 'desert',
    name: 'Desert Refueling Station',
    scheme: 'light',
    colors: desertColors,
    fonts: desertFonts,
    fontSizes,
    space,
    radius: desertRadius,
    shadow: desertShadow,
  },
  ferrari: {
    id: 'ferrari',
    name: 'Edizione Corsa',
    scheme: 'dark',
    colors: ferrariColors,
    fonts: ferrariFonts,
    fontSizes,
    space,
    radius: ferrariRadius,
    shadow: ferrariShadow,
  },
  airtable: {
    id: 'airtable',
    name: 'Editorial',
    scheme: 'light',
    colors: airtableColors,
    fonts: airtableFonts,
    fontSizes,
    space,
    radius: airtableRadius,
    shadow: airtableShadow,
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'desert';

// Top-level desert tokens kept as named exports so legacy callsites keep
// working until they switch to useTheme().
export const colors = desertColors;
export const fonts = desertFonts;
export const shadow = desertShadow;
