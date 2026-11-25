import './style.css';
import { uiColors } from './logic/color';
import { browserStorage, isFirstVisit, markWelcomed } from './logic/firstVisit';
import { exportFileName, WALLPAPER_SIZES, type WallpaperSize } from './logic/export';
import { ResolutionGovernor } from './logic/governor';
import { UndoStack } from './logic/history';
import { defaultValues, type ParamValues } from './logic/params';
import { randomizeState } from './logic/randomize';
import { hashSeed, makeSeed } from './logic/rng';
import { shareLink, type ShareEnv } from './logic/share';
import { decodeState, encodeState, type AppState } from './logic/urlState';
import { findPalette, PALETTES, type Palette } from './palettes';
import { findPattern, PATTERNS } from './patterns';
import { UnsupportedError, type Pattern, type PatternInstance, type Point } from './patterns/types';
import { buildControls } from './ui/controls';
import { LiveThumbnails, type ThumbState } from './ui/thumbnails';

/** Device pixels per CSS pixel, capped: beyond 2× the extra pixels cost more than they show. */
const MAX_PIXEL_RATIO = 2;
/** A lost WebGL context that hasn't come back by now gets a fresh canvas instead. */
const RESTORE_WAIT_MS = 3000;

const stage = document.querySelector<HTMLElement>('#stage')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

const state: AppState = decodeState(location.search, PATTERNS, PALETTES, () => makeSeed());
let pattern = findPattern(state.pattern);
let palette: Palette = findPalette(state.palette);

let canvas: HTMLCanvasElement | null = null;
let instance: PatternInstance | null = null;
let playing = true;
let dirty = true;
let urlTimer = 0;
let saving = false;
/** The instance drawing a wallpaper; it outlives a pattern switch until the save is done. */
let exporting: PatternInstance | null = null;
/** States from before each Randomize, newest last. */
const undoStack = new UndoStack<AppState>(20);
/** Slider values of the patterns visited this session, so switching back finds them as they were. */
const paramsByPattern = new Map<string, ParamValues>();
/** Drops the canvas resolution on devices that can't keep up with a pattern. */
const resolution = new ResolutionGovernor();
/** Randomizes since the first-visit tip appeared; it bows out after a few. */
let tipRandomizes = 0;
const TIP_RANDOMIZES = 3;

applyPaletteToPage(palette);

const controls = buildControls(
  ui,
  { patterns: PATTERNS, pattern, values: state.params, palettes: PALETTES, palette, sizes: WALLPAPER_SIZES },
  {
    onPattern(next) {
      paramsByPattern.set(pattern.id, { ...state.params });
      crossfade();
      state.pattern = next.id;
      state.params = paramsByPattern.get(next.id) ?? defaultValues(next.params);
      showPattern(next);
      saveUrl();
    },
    onParam(key, value) {
      state.params[key] = value;
      instance?.setParams(state.params);
      controls.setValues(state.params);
      dirty = true;
      saveUrl();
    },
    onPreset(preset) {
      crossfade();
      Object.assign(state.params, preset.values);
      instance?.setParams(state.params);
      instance?.reset(hashSeed(state.seed));
      controls.setValues(state.params);
      dirty = true;
      saveUrl();
    },
    onPalette(next) {
      crossfade();
      palette = next;
      state.palette = next.id;
      instance?.setPalette(next);
      controls.setPalette(next);
      applyPaletteToPage(next);
      dirty = true;
      saveUrl();
    },
    onSave: saveWallpaper,
    onTogglePlay: togglePlay,
    onRestart: restart,
    onRandomize: randomize,
    onUndo: undo,
    onShare: share,
    onPanel: (open) => thumbs.setVisible(open),
    onWelcomeDone: () => markWelcomed(browserStorage()),
  },
);

const thumbs = new LiveThumbnails(PATTERNS, (p) => controls.thumbSlot(p), thumbState());

/** What the switcher's previews should show: this seed and palette, each pattern's own sliders. */
function thumbState(): ThumbState {
  return {
    seed: hashSeed(state.seed),
    palette,
    paramsFor: (p) =>
      p.id === pattern.id ? state.params : (paramsByPattern.get(p.id) ?? defaultValues(p.params)),
  };
}

/** Switch the controls and the canvas over to `next`, using the current state. */
function showPattern(next: Pattern): void {
  pattern = next;
  controls.setPattern(next, state.params);
  mount();
  if (!playing) togglePlay(); // a fresh start is only seeds until it grows
  dirty = true;
}

function mount(): void {
  if (instance !== exporting) instance?.dispose(); // else saveWallpaper lets it go when done
  canvas?.remove();
  instance = null;
  stage.querySelector('.unsupported')?.remove();

  const c = document.createElement('canvas');
  canvas = c;
  stage.append(c);
  resolution.reset(); // every pattern gets a go at full sharpness
  c.addEventListener('webglcontextlost', (e) => {
    if (c !== canvas) return; // the canvas we just disposed
    e.preventDefault(); // allow restoring
    instance = null;
    // Some browsers never restore (or not for a long while): start over on a new canvas.
    window.setTimeout(() => {
      if (c === canvas && !instance) mount();
    }, RESTORE_WAIT_MS);
  });
  c.addEventListener('webglcontextrestored', () => {
    if (c === canvas && !instance) mount();
  });
  attachPainting(c);

  try {
    instance = pattern.create({
      canvas: c,
      seed: hashSeed(state.seed),
      params: state.params,
      palette,
    });
  } catch (err) {
    if (!(err instanceof UnsupportedError)) console.error(err);
    showUnsupported();
    return;
  }
  // Only patterns you can paint on get the crosshair.
  c.style.cursor = instance.paint ? '' : 'default';
  sizeCanvas();
}

/** Device pixels per CSS pixel for the canvas now. */
function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, resolution.cap);
}

function sizeCanvas(): void {
  if (!canvas || !instance) return;
  const ratio = pixelRatio();
  const width = Math.max(1, Math.round(stage.clientWidth * ratio));
  const height = Math.max(1, Math.round(stage.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  instance.resize(width, height, ratio);
  dirty = true;
}

/** How long the old picture takes to melt into the new one. */
const FADE_MS = 650;

/**
 * Lay a still of the current picture over the canvas and fade it out, so
 * whatever changes next (a new pattern, a new look) dissolves in rather
 * than jumping.
 */
function crossfade(): void {
  if (!canvas || !instance) return;
  const old = stage.querySelector<HTMLCanvasElement>('.fade');
  if (old) release(old);
  const still = document.createElement('canvas');
  still.className = 'fade';
  still.width = canvas.width;
  still.height = canvas.height;
  // WebGL keeps no picture between frames, so draw one right before copying it.
  instance.render();
  still.getContext('2d')?.drawImage(canvas, 0, 0);
  stage.append(still);
  if (fading) release(fading.still); // a fade that never got going
  fading = { still, frames: 0 };
}

/**
 * Take a canvas out of the page and free its pixels now. Safari counts
 * canvas memory until garbage collection and refuses new canvases past a
 * limit, so stills and exports must not wait for it.
 */
function release(c: HTMLCanvasElement): void {
  c.remove();
  c.width = c.height = 0;
}

/** A still waiting to fade, and frames drawn since. */
let fading: { still: HTMLCanvasElement; frames: number } | null = null;

/**
 * Starts the fade once the new picture has drawn a couple of frames: setting
 * up a pattern (compiling shaders, say) can hold up the page for a moment,
 * and a fade started before that would be over before anyone saw it.
 */
function advanceFade(): void {
  if (!fading || ++fading.frames < 2) return;
  const { still } = fading;
  fading = null;
  still
    .animate(
      reducedMotion.matches
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.03)' },
          ],
      { duration: reducedMotion.matches ? FADE_MS / 2 : FADE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    )
    .finished.then(
      () => release(still),
      () => release(still),
    );
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let last = 0;
function frame(time: number): void {
  requestAnimationFrame(frame);
  const dt = last ? time - last : 1000 / 60;
  last = time;
  if (!instance) {
    advanceFade();
    thumbs.tick(playing);
    return;
  }
  if (playing) {
    instance.step(dt);
    dirty = true;
    // Only frames that animate say anything about the device; a save keeps the GPU busy on purpose.
    if (!saving && resolution.update(dt, pixelRatio())) {
      sizeCanvas();
    }
  }
  if (dirty) {
    instance.render();
    dirty = false;
  }
  advanceFade();
  thumbs.tick(playing);
}

/** Render the pattern at full size for `size` and download it as a PNG. */
async function saveWallpaper(size: WallpaperSize): Promise<void> {
  if (!instance || saving) return;
  saving = true;
  const source = (exporting = instance);
  const name = exportFileName(pattern.id, state.seed);
  controls.setSaveStatus(size, { state: 'working', progress: 0 });
  let ok = false;
  try {
    const image = await source.renderImage(size.width, size.height, {
      onProgress: (progress) => controls.setSaveStatus(size, { state: 'working', progress }),
    });
    const blob = await new Promise<Blob | null>((resolve) => image.toBlob(resolve, 'image/png'));
    image.width = image.height = 0; // free the full-size pixels now (see release)
    if (!blob) throw new Error('Could not encode the image');
    download(blob, name);
    ok = true;
  } catch (err) {
    console.error(err);
  } finally {
    saving = false;
    exporting = null;
    if (source !== instance) source.dispose(); // switched away while it worked
  }
  controls.setSaveStatus(size, { state: ok ? 'done' : 'failed' });
  window.setTimeout(() => controls.setSaveStatus(size, null), ok ? 2000 : 4000);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before letting go of the data.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function togglePlay(): void {
  playing = !playing;
  controls.setPlaying(playing);
}

function restart(): void {
  crossfade();
  state.seed = makeSeed();
  instance?.reset(hashSeed(state.seed));
  dirty = true;
  saveUrl();
}

/** Jump to a fresh random look: new seed, preset-like params, another palette. */
function randomize(): void {
  if (++tipRandomizes >= TIP_RANDOMIZES) controls.dismissWelcome();
  undoStack.push(snapshot());
  applyState(randomizeState(state, pattern, PALETTES, makeSeed()));
  controls.setCanUndo(true);
  controls.spinDice();
}

/** Go back to how things were before the last Randomize. */
function undo(): void {
  const previous = undoStack.pop();
  if (!previous) return;
  applyState(previous);
  controls.setCanUndo(undoStack.size > 0);
}

function snapshot(): AppState {
  return { ...state, params: { ...state.params } };
}

/** Show `next`: its pattern, params, palette and seed, regrown from the start. */
function applyState(next: AppState): void {
  const switching = next.pattern !== pattern.id;
  crossfade();
  if (switching) paramsByPattern.set(pattern.id, { ...state.params });
  state.seed = next.seed;
  state.params = { ...next.params };
  palette = findPalette(next.palette);
  state.palette = palette.id;
  controls.setPalette(palette);
  applyPaletteToPage(palette);
  if (switching) {
    // Undo can lead back to a pattern from before a switch.
    state.pattern = next.pattern;
    showPattern(findPattern(next.pattern));
  } else {
    instance?.setParams(state.params);
    instance?.setPalette(palette);
    instance?.reset(hashSeed(state.seed));
    controls.setValues(state.params);
    if (!playing) togglePlay(); // a fresh start is only seeds until it grows
    dirty = true;
  }
  saveUrl();
}

/** Share sheet on phones, copy the link elsewhere. Runs inside the click, as browsers require. */
async function share(): Promise<void> {
  const url = location.origin + location.pathname + encodeState(state, pattern);
  const result = await shareLink(url, 'Morpho', shareEnv());
  if (result === 'copied') controls.toast('Link copied');
  else if (result === 'failed') window.prompt('Copy this link to share the pattern:', url);
}

function shareEnv(): ShareEnv {
  return {
    share: navigator.share ? (data) => navigator.share(data) : undefined,
    copy: navigator.clipboard ? (text) => navigator.clipboard.writeText(text) : undefined,
    preferNativeShare: matchMedia('(hover: none) and (pointer: coarse)').matches,
  };
}

function attachPainting(c: HTMLCanvasElement): void {
  const strokes = new Map<number, Point>();
  const toPoint = (e: PointerEvent): Point => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  c.addEventListener('pointerdown', (e) => {
    if (!instance?.paint || (e.pointerType === 'mouse' && e.button !== 0)) return;
    c.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    strokes.set(e.pointerId, p);
    instance.paint(p, p);
    controls.dismissHint();
    dirty = true;
  });
  c.addEventListener('pointermove', (e) => {
    const prev = strokes.get(e.pointerId);
    if (!prev || !instance?.paint) return;
    const p = toPoint(e);
    instance.paint(prev, p);
    strokes.set(e.pointerId, p);
    dirty = true;
  });
  const end = (e: PointerEvent) => strokes.delete(e.pointerId);
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

function saveUrl(): void {
  thumbs.sync(thumbState());
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    history.replaceState(null, '', location.pathname + encodeState(state, pattern));
  }, 250);
}

function applyPaletteToPage(p: Palette): void {
  const root = document.documentElement;
  const { accent, soft } = uiColors(p.colors);
  root.style.setProperty('--bg', p.background);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--soft', soft);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.background);
}

function showUnsupported(): void {
  const note = document.createElement('p');
  note.className = 'unsupported';
  note.textContent = `${pattern.name} can’t run in this browser. Try the latest Chrome, Safari, Firefox or Edge, or pick another pattern.`;
  stage.append(note);
}

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  // Leave typing alone. Sliders have no use for these keys, so they still work there.
  if (target.closest('input:not([type="range"]), select, textarea, [contenteditable]')) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    undo();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // A button reached with the keyboard keeps its own Space; one that was just clicked doesn't.
  if (key === ' ' && target.closest('button') && target.matches(':focus-visible')) return;
  if (key === ' ') {
    e.preventDefault();
    if (e.repeat) return; // holding Space shouldn't flood the undo history
    randomize();
  } else if (key === 'z') {
    undo();
  } else if (key === 'p') {
    togglePlay();
  } else if (key === 'r') {
    restart();
  }
});

mount();
saveUrl();
// The main pattern gets the first frames; previews follow a moment later.
window.setTimeout(() => thumbs.setVisible(controls.panelOpen), 400);
if (isFirstVisit(browserStorage())) controls.showWelcome();
new ResizeObserver(sizeCanvas).observe(stage);
requestAnimationFrame(frame);
