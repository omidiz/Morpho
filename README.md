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
- `src/patterns/phyllotaxis/`: Spirals, sunflower-style seed heads drawn with
  Canvas 2D (see below).
- `src/patterns/physarum/`: Slime, a slime mold network grown by hundreds of
  thousands of explorers on the GPU (see below).
- `src/ui/controls.ts`: builds the panel from a pattern's schema (a slider per
  parameter, with an optional quiet value readout; a switch for on/off ones; a
  row of named choices for ones like shape; nothing for ones only presets set),
  plus the pattern picker, preset chips, palette swatches, play/pause/restart,
  the Undo · Randomize · Share dock and the "Save wallpaper" sheet.
- `src/logic/`: pure, tested logic: seeded RNG, URL state, randomize, undo
  history, share fallback, slider ↔ model mappings, frame governor, color
  contrast, export sizing, the L-system, plant species, forest layout and
  growth timing behind the plants, the seed-head layout behind Spirals, and
  the crowd, trail and export sizing behind Slime.
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

## Spirals

Seed heads like a sunflower's (`src/logic/phyllotaxis.ts`): each seed turns
by the same angle from the last and sits a little further out. At the golden
angle (137.51°) the seeds pack evenly and Fibonacci spirals appear (21, 34,
55, 89 arms as the head grows); any other angle breaks them into spokes or
curved arms.

- **Angle.** The slider has the golden angle in the middle and is finest
  there, where a tenth of a degree already breaks the spirals; it sweeps
  faster toward the ends (about 92° to 182°, past the 2, 3 and 5 arms of
  180°, 120° and 144°). The angle is shown quietly under the slider's name.
- **Size growth.** With none, seeds sit at radius ∝ √n and are all one size.
  With growth, a seed's size goes as distance^k and the spacing widens to
  match, so the head stays evenly packed: small seeds at the heart, large ones
  at the rim.
- **Shape and color.** Dots, petals (almonds pointing outward) or rings.
  Color follows either the spiral arms (the family that stands out two
  thirds of the way out, found by checking which seeds sit closest; arms are
  colored in bands that wrap round without a seam) or the distance from the
  center.
- **Looks.** Sunflower, Pinecone, Daisy and Galaxy (an angle just off golden,
  so the spirals sweep into curved arms).
- **Seed.** Gives each head a turn and a little natural variation in seed
  size and placement.
- **Drawing.** Seeds are batched into one path per color, so even 3,000 of
  them redraw within a frame on a phone while the head fills in from the
  heart. Wallpapers are drawn afresh as vectors at full size.

## Slime

A slime mold (Physarum) network grown by a crowd of tiny explorers, 20,000 to
a million of them. Each one walks forward, leaves a trail, and feels ahead
with three feelers (left, ahead, right), turning toward the strongest trail.
The trail spreads a little and fades every step. Veins, roots and webs grow
out of nothing more than that.

- **On the GPU.** Every explorer is one texel of a float texture, 1024 to a
  row. Each step is three passes: a full-screen pass moves everyone (feel,
  turn, walk, wrap around the edges); one point per explorer, placed by its
  index with no vertex buffers, is drawn with additive blending to drop
  trail; and a pass spreads and fades the trail. The map has one cell per
  CSS pixel (capped at a million cells on large screens).
- **Why it doesn't collapse.** Feelers can't tell trail apart above 1.5× the
  map's average, so where explorers pile up the trail feels flat and they
  drift back out along the veins. Only 15% of the trail spreads per step,
  which keeps veins crisp. Trail per explorer is set so the map averages 1
  however many explorers there are, so the display needs no retuning
  (`depositPerAgent` in `src/logic/physarum.ts`).
- **Smooth on phones.** When frames drop, the frame governor thins the crowd
  (whole rows sit out, down to about 15%), and each remaining explorer leaves
  more trail, so the picture keeps its brightness and shape; past that it
  slows the steps too. The slider and the link don't change. Trails use
  32-bit floats where the device can blend them and 16-bit floats otherwise,
  where the slowest fade is limited so small deposits aren't rounded away.
- **Sliders.** Explorers, Feeler angle, Turn speed and Trail fade. Feeler
  reach and the starting layout (Scatter, or Sprout from the middle) are set
  by the looks only, but live in the link like everything else.
- **Looks.** Veins, Roots (sprouting from the middle), Neurons (wide feelers,
  sharp turns: a dense cellular mesh) and Galaxy web (long reach, gentle
  turns: wispy, layered filaments). Changing the crowd size keeps everyone
  already out there and clones more from them, so nothing jumps.
- **Food.** Tap to drop food, or drag to drop a line of it (up to 24 at
  once; Restart clears them). Food glows into the trail and is felt from
  about 30 px away, beyond the feeler cap, so the network bends toward it
  and links the spots up like a metro map.
- **Export.** The visible part of the map is copied onto a grid at the
  wallpaper's resolution, with a crowd as dense as on screen (up to 1.6
  million explorers). Explorers outside the crop are swapped for clones from
  inside it. Then it keeps growing for about 110 steps, with walking and
  reach scaled up, so the veins are redrawn sharp at full size rather than
  upscaled.

## Exploring and sharing

Everything that makes a pattern (pattern, seed, palette, every slider) lives
in the URL, e.g. `?p=turing&seed=k7mq2x&pal=moss&speed=5&scale=2&food=0.76&fade=0.284`,
so a copied link grows the same pattern. Links depend on the seed hash and
RNG staying exactly as they are; `src/logic/rng.test.ts` pins their output.

- **Randomize** picks a new seed, then derives everything else from it
  (`randomizeState` in `src/logic/randomize.ts`): a random preset, nudged
  within each pattern's `explore` rules so it stays in the region that looks
  good, and a different palette. Sliders without a rule (like speed, growth
  steps, forest or the number of explorers) are left alone. For Spirals, Randomize stays within about
  a degree of the golden angle (or of the galaxy's).
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
vectors for the wallpaper's shape, and seed heads are redrawn at full size.
Slime regrows its network on a full-size map (see above). Turing patterns copy
the screen's simulation onto a grid several times finer, then keep
growing it there for a moment, with the reaction slowed by 1/refine² so the
shapes keep their size instead of re-forming smaller
(`exportGrid` in `src/logic/grayScott.ts`). The result has real detail at
full resolution rather than an upscale. Work is split across frames so the
page stays responsive, and the image is read back in tiles.

To add a pattern, implement `Pattern` in `src/patterns/<name>/` and add it to
`PATTERNS` in `src/patterns/index.ts`. The UI, URL state and Randomize pick it
up; give it `explore` rules that keep Randomize to good-looking values.
