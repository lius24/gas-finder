// Desert Refueling Station — gas-finder design tokens.
//
// Aesthetic: 1960s Southwestern highway gas station poster meets vintage
// mechanical pump display. Warm paper background, deep rust signage, amber
// highlights, and seven-segment-evoking numerals for prices.

export const colors = {
  // Surfaces
  bg: '#F4EFE6',          // Warm cream "paper"
  paper: '#FBF6ED',       // Lighter cream for cards
  paperEdge: '#EDE5D2',   // Edge / divider on paper

  // Ink
  ink: '#1C1814',         // Near-black with a warm cast
  inkSoft: '#5C544A',     // Warm gray for body
  inkFaint: '#9A8E7C',    // Faint sand-ink for meta

  // Signage
  rust: '#8B2E1B',        // Deep oxblood — primary action / brand
  rustDark: '#651E10',    // Pressed state for rust
  amber: '#D4882C',       // Sunset amber — accent
  amberDark: '#A4651E',   // Pressed amber

  // Native / earth
  moss: '#4A5D3E',        // Muted green for "ok" / source.official
  sand: '#D9CFB8',        // Sandy borders + dividers
  dust: '#C4B89F',        // Slightly stronger divider
  cactus: '#7B8B6F',      // Dry green secondary

  // Functional
  danger: '#A52B1A',
  good: '#4A5D3E',
  shadow: 'rgba(40, 28, 16, 0.10)',
} as const;

export const fonts = {
  // Display serif with character — wonky/soft optical axis available.
  display: 'Fraunces_700Bold',
  displayRegular: 'Fraunces_400Regular',
  displayItalic: 'Fraunces_500Medium_Italic',

  // Warm reading serif for body copy.
  body: 'Newsreader_400Regular',
  bodyMedium: 'Newsreader_500Medium',
  bodyBold: 'Newsreader_700Bold',
  bodyItalic: 'Newsreader_400Regular_Italic',

  // Mechanical / monospaced for octane labels and minor numerals — looks like
  // an old digital pump readout. Use this for small/secondary numbers where
  // the schematic look matters more than weight.
  numeral: 'MajorMonoDisplay_400Regular',

  // Heavy mono for price displays — full chunky weight reads as the marquee
  // number on a station price sign. Use this for the dominant price digits.
  priceHeavy: 'JetBrainsMono_800ExtraBold',
} as const;

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

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const shadow = {
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
} as const;
