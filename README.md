# Morpho

A bio-pattern studio: generate living patterns from biology and export them as wallpapers.

Live at https://omidiz.github.io/morpho/

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # run tests (Vitest)
npm run build    # type-check and build to dist/
```

## How it's organized

- `src/patterns/types.ts`: the `Pattern` interface every pattern implements
  (id, name, slider schema, presets, and `create()` → step/render/paint).
- `src/patterns/turing/`: Turing patterns (Gray-Scott reaction-diffusion) on
  the GPU with WebGL2 ping-pong float textures.
- `src/ui/controls.ts`: builds sliders from a pattern's schema, plus preset
  chips, palette swatches, play/pause/restart, the Undo · Randomize · Share
  dock and the "Save wallpaper" sheet.
- `src/logic/`: pure, tested logic: seeded RNG, URL state, randomize, undo
  history, share fallback, slider ↔ model mappings, frame governor, color
  contrast, export sizing.
- `src/palettes.ts`: palettes shared by all patterns. Each has a background
  and 3–5 colors the pattern is mapped across; the page's own colors are
  picked from it for contrast.

## Exploring and sharing

Everything that makes a pattern (pattern, seed, palette, every slider) lives
in the URL, e.g. `?p=turing&seed=k7mq2x&pal=moss&speed=5&scale=2&food=0.76&fade=0.284`,
so a copied link grows the same pattern. Links depend on the seed hash and
RNG staying exactly as they are; `src/logic/rng.test.ts` pins their output.

- **Randomize** picks a new seed, then derives everything else from it
  (`randomizeState` in `src/logic/randomize.ts`): a random preset, nudged
  within each pattern's `explore` rules so it stays in the region that looks
  good, and a different palette. Sliders without a rule (like speed) are left
  alone.
- **Undo** steps back through the last 20 randomizes.
- **Share** opens the system share sheet on phones and tablets, and copies
  the link everywhere else (or if the share sheet fails).

| Key | Action |
| --- | --- |
| Space | Randomize |
| Z or Ctrl/⌘ Z | Undo randomize |
| P | Play / pause |
| R | Start over with a new seed |

## Wallpaper export

"Save wallpaper" renders the pattern afresh at the chosen size (Phone
1170×2532, Desktop 2560×1440, Square 2048×2048) and downloads
`morpho-<pattern>-<seed>.png`. The view is fitted like `object-fit: cover`:
what is on screen, centered and trimmed to the wallpaper's shape.

Each pattern implements `renderImage(width, height)`. Turing patterns copy
the screen's simulation onto a grid several times finer, then keep
growing it there for a moment, with the reaction slowed by 1/refine² so the
shapes keep their size instead of re-forming smaller
(`exportGrid` in `src/logic/grayScott.ts`). The result has real detail at
full resolution rather than an upscale. Work is split across frames so the
page stays responsive, and the image is read back in tiles.

To add a pattern, implement `Pattern` in `src/patterns/<name>/` and add it to
`PATTERNS` in `src/patterns/index.ts`. The UI, URL state and Randomize pick it
up; give it `explore` rules that keep Randomize to good-looking values.
