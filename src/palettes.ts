/**
 * Color palettes shared by every pattern. Four colors from "empty space" to
 * "full pattern": background, shadow, body, highlight.
 */
export interface Palette {
  id: string;
  name: string;
  colors: readonly [string, string, string, string];
}

export const PALETTES: readonly Palette[] = [
  { id: 'tidepool', name: 'Tidepool', colors: ['#0d2b2f', '#24605d', '#8cc4ad', '#eaf2dc'] },
  { id: 'moss', name: 'Moss', colors: ['#1a2214', '#46592a', '#a7b85c', '#f0efc4'] },
  { id: 'dusk', name: 'Dusk', colors: ['#1a1633', '#55397a', '#cf7fa4', '#fbe2d2'] },
  { id: 'shell', name: 'Shell', colors: ['#e8eef1', '#9fb6c6', '#3d5c74', '#10202e'] },
];

export const DEFAULT_PALETTE = PALETTES[0];
