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
- `src/patterns/plants/`: L-system plants drawn with Canvas 2D (see below).
- `src/ui/controls.ts`: builds the panel from a pattern's schema (a slider per
  parameter, a switch for on/off ones, nothing for ones only presets set),
  plus the pattern picker, preset chips, palette swatches, play/pause/restart,
  the Undo · Randomize · Share dock and the "Save wallpaper" sheet.
- `src/logic/`: pure, tested logic: seeded RNG, URL state, randomize, undo
  history, share fallback, slider ↔ model mappings, frame governor, color
  contrast, export sizing, and the L-system, plant species, forest layout and
  growth timing behind the plants.
- `src/palettes.ts`: palettes shared by all patterns. Each has a background
  and 3–5 colors the pattern is mapped across; the page's own colors are
  picked from it for contrast.

## Plants

Five kinds of plant (Fern, Tree, Bush, Seaweed, Lightning tree), each a small
L-system in `src/logic/plantSpecies.ts`: a starting word and rules that
rewrite it once per generation, some with weighted alternatives. A turtle
walks the final word (`F` draws, `+ -` turn, `[ ]` branch) to build a tree of
segments; wind then bends it, thin twigs more than the trunk.

- **Growth.** Each generation grows out from the root over the one before,
  then leaves, blossoms, pods or sparks open at the twig ends. Every symbol
  keeps a stable id across generations and all randomness is keyed to those
  ids (`src/logic/lsystem.ts`), so each generation keeps the shape of the last
  and the animation never jumps.
- **Natural look.** Turn angles, branch lengths and a little drift vary with
  the Randomness slider. Branch widths follow the da Vinci rule: a branch's
  cross-section is shared out among the twigs it carries.
- **Forest.** The switch places several plants of the same kind, near ones
  large and bold, far ones smaller, higher up and faded into the background
  (`src/logic/forest.ts`). Far plants get a generation or two less detail.
- **Budget.** No plant has more than 16,000 segments; tests check every
  species reaches every growth step under it. Segments are drawn in a dozen
  width steps, one path each, and nothing is redrawn once growth is done.
- **Export.** Plants are vector, so a wallpaper is laid out afresh for its
  shape (refitted, not cropped) and drawn fully grown.

## Exploring and sharing

Everything that makes a pattern (pattern, seed, palette, every slider) lives
in the URL, e.g. `?p=turing&seed=k7mq2x&pal=moss&speed=5&scale=2&food=0.76&fade=0.284`,
so a copied link grows the same pattern. Links depend on the seed hash and
RNG staying exactly as they are; `src/logic/rng.test.ts` pins their output.

- **Randomize** picks a new seed, then derives everything else from it
  (`randomizeState` in `src/logic/randomize.ts`): a random preset, nudged
  within each pattern's `explore` rules so it stays in the region that looks
  good, and a different palette. Sliders without a rule (like speed, growth
  steps or forest) are left alone.
- **Switching patterns** keeps the seed and palette; each pattern remembers
  its own sliders for the session.
- **Undo** steps back through the last 20 randomizes, switching pattern back
  if needed.
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

Each pattern implements `renderImage(width, height)`. Plants are redrawn as
vectors for the wallpaper's shape. Turing patterns copy
the screen's simulation onto a grid several times finer, then keep
growing it there for a moment, with the reaction slowed by 1/refine² so the
shapes keep their size instead of re-forming smaller
(`exportGrid` in `src/logic/grayScott.ts`). The result has real detail at
full resolution rather than an upscale. Work is split across frames so the
page stays responsive, and the image is read back in tiles.

To add a pattern, implement `Pattern` in `src/patterns/<name>/` and add it to
`PATTERNS` in `src/patterns/index.ts`. The UI, URL state and Randomize pick it
up; give it `explore` rules that keep Randomize to good-looking values.
