/** "#rrggbb" or "#rgb" → [r, g, b] in 0..1. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Invalid color: ${hex}`);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Relative luminance (WCAG 2), 0 for black to 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, from 1 (same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The app's own controls sit on one quiet dark surface whatever the palette,
 * so they never compete with the art. Only the accent comes from the palette.
 */
export const UI_SURFACE = '#111316';
/** Neutral text and icons on the surface. */
export const UI_INK = '#ecebe6';

/** Accents for the app's own controls, picked from a palette. */
export interface UiColors {
  /** Randomize button, selected things: the palette color that stands out most on the surface. */
  accent: string;
  /** Slider fill: the next most visible color, if it still shows up well. */
  soft: string;
}

/** Below this, a color is lost on the dark surface (WCAG's figure for UI parts). */
const MIN_UI_CONTRAST = 3;

export function uiColors(colors: readonly string[], surface = UI_SURFACE): UiColors {
  const ranked = [...colors].sort((a, b) => contrast(b, surface) - contrast(a, surface));
  let accent = ranked[0];
  // A palette of dark inks only: lift its brightest toward white until it reads.
  for (let t = 0.1; contrast(accent, surface) < 7 && t <= 1; t += 0.1) accent = mixHex(ranked[0], '#ffffff', t);
  const second = ranked[1];
  const soft = second && contrast(second, surface) >= MIN_UI_CONTRAST ? second : accent;
  return { accent, soft };
}

/** Blend from `a` (t = 0) to `b` (t = 1), as "#rrggbb". */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = Math.min(1, Math.max(0, t));
  const hex = ca
    .map((c, i) => Math.round((c + (cb[i] - c) * k) * 255).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}
