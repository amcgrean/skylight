import type { TextStyle } from 'react-native';

/** 1950s mid-century palette: cream paper, bubblegum pink, mint, butter yellow. */
export const Palette = {
  cream: '#FBF3E4',
  paper: '#FFFDF8',
  ink: '#2E2A26',
  inkSoft: '#6B6157',
  inkMid: '#4A433C',
  line: '#EADFCB',
  lineDark: '#C9BBA3',
  sand: '#F1E8D8',

  pink: '#F8D7DE',
  pinkDeep: '#B83E61',
  pinkText: '#5E3A45',

  mint: '#D5EEE2',
  mintMid: '#9FD3BC',
  mintDeep: '#2F6B5A',
  mintText: '#2F5248',

  butter: '#FCEBC0',
  butterText: '#5C4A1E',

  sky: '#D3EEF2',
  skyText: '#1F4A52',
} as const;

/** Font files, keyed by the family names used in styles. Loaded in the root layout. */
export const fontFiles = {
  'JosefinSans-Regular': require('../../assets/fonts/JosefinSans_400Regular.ttf'),
  'JosefinSans-SemiBold': require('../../assets/fonts/JosefinSans_600SemiBold.ttf'),
  'JosefinSans-Bold': require('../../assets/fonts/JosefinSans_700Bold.ttf'),
  'Pacifico-Regular': require('../../assets/fonts/Pacifico_400Regular.ttf'),
};

export type Weight = 'regular' | 'semibold' | 'bold';

const families: Record<Weight, string> = {
  regular: 'JosefinSans-Regular',
  semibold: 'JosefinSans-SemiBold',
  bold: 'JosefinSans-Bold',
};

export const AppFont = {
  body: (size: number, weight: Weight = 'semibold'): TextStyle => ({ fontFamily: families[weight], fontSize: size }),
  script: (size: number): TextStyle => ({ fontFamily: 'Pacifico-Regular', fontSize: size }),
};

/** Adds an alpha channel to a "#RRGGBB" color. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex;
}

/** Light tint used behind a member's event cards. */
export const memberTint = (hex: string) => withAlpha(hex, 0.28);
