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

/** Colors for the app's own buttons and text, picked from a palette. */
export interface ChromeColors {
  /** Page and panel background. */
  bg: string;
  /** Text and icons: the palette color that stands out most from the background. */
  ink: string;
  /** Slider fill: the next most visible color. */
  accent: string;
}

export function chromeColors(background: string, colors: readonly string[]): ChromeColors {
  const ranked = [...colors].sort((a, b) => contrast(b, background) - contrast(a, background));
  return { bg: background, ink: ranked[0], accent: ranked[1] ?? ranked[0] };
}
