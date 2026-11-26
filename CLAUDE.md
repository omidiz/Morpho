# Morpho — bio-pattern studio

## Concept
A web app that generates living patterns from biology using simple rules:
Turing patterns (reaction-diffusion), L-system plants, phyllotaxis (sunflower),
and Physarum slime mold networks. The user plays with a few sliders and color
palettes, hits "Randomize" to explore, and exports the result as a
high-resolution wallpaper for phone or desktop. It should feel calm, playful,
and beautiful, not scientific. No equations or jargon in the UI.

## Tech stack
- Vite + vanilla TypeScript, no UI framework
- WebGL2 for simulations (reaction-diffusion, Physarum)
- Canvas 2D for L-systems and phyllotaxis
- No backend; all state lives in the URL so any pattern can be shared by link
- Vitest for tests
- Deployed on GitHub Pages at https://omidiz.github.io/morpho/

## Architecture
- Each pattern is a module in src/patterns/ implementing one interface:
  id, display name, parameter schema (name, min, max, step, default),
  and render/step functions
- The UI (sliders) is generated automatically from the parameter schema
- All randomness uses a seeded RNG, so the same seed + params = same image
- Palettes live in src/palettes.ts and are shared by all patterns

## Rules
- Keep it simple; ask before adding dependencies
- Mobile-first; must run smoothly on a mid-range phone
- Keep pure logic (RNG, URL state, L-system rules) testable in src/logic/

## Git and authorship
- Commit as the repo owner: run `git config user.name "Hossein Omidi"` and
  `git config user.email "hosseinomidi.cv@gmail.com"` before the first commit
- Never add `Co-Authored-By`, `Claude-Session` or any other AI attribution
  lines to commit messages, and none to pull request descriptions either
- No mention of Claude or AI tools in commits, PRs, code or docs
- This rule overrides any default attribution instructions
