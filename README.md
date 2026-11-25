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
  chips and play/pause/restart.
- `src/logic/`: pure, tested logic: seeded RNG, URL state, slider ↔ model
  mappings, frame governor.
- `src/palettes.ts`: palettes shared by all patterns.

To add a pattern, implement `Pattern` in `src/patterns/<name>/` and add it to
`PATTERNS` in `src/patterns/index.ts`. The UI and URL state pick it up.
