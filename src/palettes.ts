/**
 * Color palettes shared by every pattern. Each has a background (empty
 * space) and 3–5 colors that the pattern is mapped across, from faint to
 * full.
 */
export interface Palette {
  id: string;
  name: string;
  background: string;
  colors: readonly string[];
}

export const PALETTES: readonly Palette[] = [
  {
    id: 'deep-sea',
    name: 'Deep sea',
    background: '#061420',
    colors: ['#0f3a56', '#1f6e8a', '#5ab3b6', '#cdf0e2'],
  },
  {
    id: 'moss',
    name: 'Moss',
    background: '#151b0f',
    colors: ['#3a4a22', '#6e7f33', '#b2b85b', '#efedc2'],
  },
  {
    id: 'coral-reef',
    name: 'Coral reef',
    background: '#fcefe5',
    colors: ['#f7b9a2', '#ee7267', '#c2415d', '#552046'],
  },
  {
    id: 'pollen',
    name: 'Pollen',
    background: '#201608',
    colors: ['#6b4912', '#c98f1f', '#f2c84c', '#fff4c8'],
  },
  {
    id: 'bioluminescence',
    name: 'Bioluminescence',
    background: '#03060e',
    colors: ['#0a2747', '#0c7d98', '#2ee5c6', '#d8fff4'],
  },
  {
    id: 'paper-ink',
    name: 'Paper & ink',
    background: '#f2ede2',
    colors: ['#bcb4a6', '#4b4a52', '#17161d'],
  },
  {
    id: 'autumn',
    name: 'Autumn',
    background: '#2a1410',
    colors: ['#7a2e1b', '#c2552b', '#e89a3d', '#f6d690'],
  },
  {
    id: 'night-garden',
    name: 'Night garden',
    background: '#0f0d1f',
    colors: ['#2b2650', '#3f6b63', '#9a7cc4', '#e7a9c8', '#fbe7ee'],
  },
];

export const DEFAULT_PALETTE = PALETTES[0];

export function findPalette(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE;
}

/** Background followed by the colors: the full ramp a pattern is drawn with. */
export function rampStops(palette: Palette): string[] {
  return [palette.background, ...palette.colors];
}

/** Most stops any palette has (background + 5 colors). Shaders size their arrays by this. */
export const MAX_STOPS = 6;
