import './style.css';
import { chromeColors } from './logic/color';
import { exportFileName, WALLPAPER_SIZES, type WallpaperSize } from './logic/export';
import { hashSeed, makeSeed } from './logic/rng';
import { decodeState, encodeState, type AppState } from './logic/urlState';
import { findPalette, PALETTES, type Palette } from './palettes';
import { findPattern, PATTERNS } from './patterns';
import { UnsupportedError, type PatternInstance, type Point } from './patterns/types';
import { buildControls } from './ui/controls';

/** Device pixels per CSS pixel, capped: beyond 2× the extra pixels cost more than they show. */
const MAX_PIXEL_RATIO = 2;

const stage = document.querySelector<HTMLElement>('#stage')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

const state: AppState = decodeState(location.search, PATTERNS, PALETTES, () => makeSeed());
const pattern = findPattern(state.pattern);
let palette: Palette = findPalette(state.palette);

let canvas: HTMLCanvasElement | null = null;
let instance: PatternInstance | null = null;
let playing = true;
let dirty = true;
let urlTimer = 0;
let saving = false;

applyPaletteToPage(palette);

const controls = buildControls(
  ui,
  { pattern, values: state.params, palettes: PALETTES, palette, sizes: WALLPAPER_SIZES },
  {
    onParam(key, value) {
      state.params[key] = value;
      instance?.setParams(state.params);
      controls.setValues(state.params);
      dirty = true;
      saveUrl();
    },
    onPreset(preset) {
      Object.assign(state.params, preset.values);
      instance?.setParams(state.params);
      instance?.reset(hashSeed(state.seed));
      controls.setValues(state.params);
      dirty = true;
      saveUrl();
    },
    onPalette(next) {
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
  },
);

function mount(): void {
  instance?.dispose();
  canvas?.remove();
  instance = null;

  const c = document.createElement('canvas');
  canvas = c;
  stage.append(c);
  c.addEventListener('webglcontextlost', (e) => {
    if (c !== canvas) return; // the canvas we just disposed
    e.preventDefault(); // allow restoring
    instance = null;
  });
  c.addEventListener('webglcontextrestored', () => {
    if (c === canvas) mount();
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
  sizeCanvas();
}

function sizeCanvas(): void {
  if (!canvas || !instance) return;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = Math.max(1, Math.round(stage.clientWidth * ratio));
  const height = Math.max(1, Math.round(stage.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  instance.resize(width, height, ratio);
  dirty = true;
}

let last = 0;
function frame(time: number): void {
  requestAnimationFrame(frame);
  const dt = last ? time - last : 1000 / 60;
  last = time;
  if (!instance) return;
  if (playing) {
    instance.step(dt);
    dirty = true;
  }
  if (dirty) {
    instance.render();
    dirty = false;
  }
}

/** Render the pattern at full size for `size` and download it as a PNG. */
async function saveWallpaper(size: WallpaperSize): Promise<void> {
  if (!instance || saving) return;
  saving = true;
  const name = exportFileName(pattern.id, state.seed);
  controls.setSaveStatus(size, { state: 'working', progress: 0 });
  let ok = false;
  try {
    const image = await instance.renderImage(size.width, size.height, {
      onProgress: (progress) => controls.setSaveStatus(size, { state: 'working', progress }),
    });
    const blob = await new Promise<Blob | null>((resolve) => image.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the image');
    download(blob, name);
    ok = true;
  } catch (err) {
    console.error(err);
  } finally {
    saving = false;
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
  state.seed = makeSeed();
  instance?.reset(hashSeed(state.seed));
  dirty = true;
  saveUrl();
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
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    history.replaceState(null, '', location.pathname + encodeState(state, pattern));
  }, 250);
}

function applyPaletteToPage(p: Palette): void {
  const root = document.documentElement;
  const chrome = chromeColors(p.background, p.colors);
  root.style.setProperty('--bg', chrome.bg);
  root.style.setProperty('--ink', chrome.ink);
  root.style.setProperty('--accent', chrome.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.background);
}

function showUnsupported(): void {
  const note = document.createElement('p');
  note.className = 'unsupported';
  note.textContent =
    'This pattern needs a browser with WebGL2. Try the latest Chrome, Safari, Firefox or Edge.';
  stage.append(note);
}

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || target.closest('input, button, select, textarea')) return;
  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'r' || e.key === 'R') {
    restart();
  }
});

mount();
saveUrl();
new ResizeObserver(sizeCanvas).observe(stage);
requestAnimationFrame(frame);
