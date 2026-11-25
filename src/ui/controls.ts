import type { WallpaperSize } from '../logic/export';
import type { ParamSpec, ParamValues } from '../logic/params';
import { rampStops, type Palette } from '../palettes';
import type { Pattern, Preset } from '../patterns/types';

export interface ControlHandlers {
  onPattern(pattern: Pattern): void;
  onParam(key: string, value: number): void;
  onPreset(preset: Preset): void;
  onPalette(palette: Palette): void;
  onSave(size: WallpaperSize): void;
  onTogglePlay(): void;
  onRestart(): void;
  onRandomize(): void;
  onUndo(): void;
  onShare(): void;
}

export interface ControlOptions {
  patterns: readonly Pattern[];
  pattern: Pattern;
  values: ParamValues;
  palettes: readonly Palette[];
  palette: Palette;
  sizes: readonly WallpaperSize[];
}

/** Where a wallpaper save is at, for the size button that started it. */
export type SaveStatus =
  | { state: 'working'; progress: number }
  | { state: 'done' }
  | { state: 'failed' };

export interface Controls {
  /** Show the presets and sliders of another pattern, set to `values`. */
  setPattern(pattern: Pattern, values: ParamValues): void;
  /** Reflect new values in the sliders and preset chips. */
  setValues(values: ParamValues): void;
  setPlaying(playing: boolean): void;
  setPalette(palette: Palette): void;
  /** Show progress on the size button for `size`; null when idle again. */
  setSaveStatus(size: WallpaperSize, status: SaveStatus | null): void;
  /** Called once someone has painted, so the hint can go away. */
  dismissHint(): void;
  /** Enable or disable the undo button. */
  setCanUndo(canUndo: boolean): void;
  /** A short message near the dock, read out by screen readers. */
  toast(message: string): void;
  /** A little spin of the dice, also for the keyboard shortcut. */
  spinDice(): void;
  destroy(): void;
}

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1.6"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6c0-1 1.1-1.6 1.9-1.1l9 6.4c.7.5.7 1.6 0 2.1l-9 6.4c-.8.6-1.9 0-1.9-1V5.6z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4h4"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5"/><path d="M5 16.5v1.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"/></svg>',
  dice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm1.2 3.4a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm7.6 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM12 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM8.2 14a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm7.6 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5a2 2 0 0 0-2-2h-1.5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Builds the controls inside `root`: a top bar with play/pause, restart,
 * save and a panel toggle; a dock with undo, a big Randomize button and
 * share; a panel with a pattern picker, the pattern's preset chips, palette
 * swatches and one control per parameter in its schema (a slider, a switch
 * or a row of choices); and a "Save wallpaper" sheet with one button per size.
 */
export function buildControls(
  root: HTMLElement,
  { patterns, pattern, values, palettes, palette, sizes }: ControlOptions,
  handlers: ControlHandlers,
): Controls {
  const playBtn = el('button', { className: 'icon-btn', type: 'button' });
  const restartBtn = el('button', { className: 'icon-btn', type: 'button', title: 'Start over' });
  restartBtn.innerHTML = ICONS.restart;
  restartBtn.setAttribute('aria-label', 'Start over with new seeds');
  const panelBtn = el('button', { className: 'icon-btn', type: 'button', title: 'Controls' });
  panelBtn.innerHTML = ICONS.sliders;
  panelBtn.setAttribute('aria-label', 'Show controls');
  panelBtn.setAttribute('aria-controls', 'panel');
  const saveBtn = el('button', { className: 'icon-btn', type: 'button', title: 'Save wallpaper' });
  saveBtn.innerHTML = ICONS.save;
  saveBtn.setAttribute('aria-label', 'Save wallpaper');
  saveBtn.setAttribute('aria-controls', 'save-sheet');

  const undoBtn = el('button', { className: 'icon-btn dock-btn', type: 'button', title: 'Undo (Z)' });
  undoBtn.innerHTML = ICONS.undo;
  undoBtn.setAttribute('aria-label', 'Undo randomize');
  const randomBtn = el('button', { className: 'randomize', type: 'button', title: 'Randomize (Space)' });
  randomBtn.innerHTML = ICONS.dice;
  randomBtn.append(el('span', {}, ['Randomize']));
  const shareBtn = el('button', { className: 'icon-btn dock-btn', type: 'button', title: 'Share' });
  shareBtn.innerHTML = ICONS.share;
  shareBtn.setAttribute('aria-label', 'Share a link to this pattern');
  const toastEl = el('p', { className: 'toast' });
  toastEl.setAttribute('role', 'status');
  const dock = el('div', { className: 'dock' }, [
    toastEl,
    el('div', { className: 'dock-row' }, [undoBtn, randomBtn, shareBtn]),
  ]);

  const bar = el('header', { className: 'bar' }, [
    el('span', { className: 'wordmark' }, ['morpho']),
    el('div', { className: 'transport' }, [playBtn, restartBtn, saveBtn, panelBtn]),
  ]);

  const tabs = patterns.map((p) => {
    const tab = el('button', { className: 'tab', type: 'button' }, [p.name]);
    tab.addEventListener('click', () => {
      if (p.id !== current.id) handlers.onPattern(p);
    });
    return { pattern: p, tab };
  });
  const tabRow = el('div', { className: 'tabs' }, tabs.map((t) => t.tab));
  tabRow.setAttribute('role', 'group');
  tabRow.setAttribute('aria-label', 'Pattern');
  tabRow.hidden = patterns.length < 2;

  const presetRow = el('div', { className: 'presets' });
  presetRow.setAttribute('role', 'group');
  presetRow.setAttribute('aria-label', 'Looks');
  const sliderBox = el('div', { className: 'sliders' });
  const hint = el('p', { className: 'hint' });

  let current = pattern;
  let chips: { preset: Preset; chip: HTMLButtonElement }[] = [];
  let inputs: ParamControl[] = [];

  /** Fill the pattern-specific parts of the panel. */
  const showPattern = (p: Pattern) => {
    current = p;
    for (const { pattern: q, tab } of tabs) tab.setAttribute('aria-pressed', String(q.id === p.id));
    chips = p.presets.map((preset) => {
      const chip = el('button', { className: 'chip', type: 'button' }, [preset.name]);
      chip.addEventListener('click', () => handlers.onPreset(preset));
      return { preset, chip };
    });
    presetRow.replaceChildren(...chips.map((c) => c.chip));
    presetRow.hidden = chips.length === 0;
    inputs = p.params
      .filter((spec) => spec.control !== 'hidden')
      .map((spec) =>
        spec.control === 'switch'
          ? switchControl(spec, handlers)
          : spec.control === 'choice'
            ? choiceControl(spec, handlers)
            : sliderControl(spec, handlers),
      );
    sliderBox.replaceChildren(...inputs.map((c) => c.row));
    hint.textContent = p.hint ?? '';
    hint.hidden = !p.hint;
    hint.classList.remove('is-gone');
  };
  showPattern(pattern);

  const paletteName = el('span', { className: 'palette-name' });
  const swatches = palettes.map((p) => {
    const swatch = el('button', { className: 'swatch', type: 'button', title: p.name });
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-label', p.name);
    swatch.style.background = swatchGradient(p);
    swatch.addEventListener('click', () => handlers.onPalette(p));
    return { palette: p, swatch };
  });
  const swatchRow = el('div', { className: 'swatches' }, swatches.map((s) => s.swatch));
  swatchRow.setAttribute('role', 'radiogroup');
  swatchRow.setAttribute('aria-label', 'Colors');
  swatchRow.addEventListener('keydown', (e) => {
    // Arrow keys move between swatches, as in any radio group.
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = swatches.findIndex((s) => s.swatch.getAttribute('aria-checked') === 'true');
    const next = swatches[(i + step + swatches.length) % swatches.length];
    next.swatch.focus();
    handlers.onPalette(next.palette);
  });
  const paletteSection = el('div', { className: 'palettes' }, [
    el('div', { className: 'palette-head' }, [el('span', {}, ['Colors']), paletteName]),
    swatchRow,
  ]);

  const panel = el('section', { className: 'panel', id: 'panel' }, [
    tabRow,
    presetRow,
    paletteSection,
    sliderBox,
    hint,
  ]);
  panel.setAttribute('aria-label', 'Pattern controls');

  let panelOpen = true;
  // On phones the dock rides on top of the panel and drops down when it hides.
  const liftDock = () => {
    const lift = panelOpen ? panel.offsetHeight + 12 : 0;
    dock.style.setProperty('--lift', `${lift}px`);
  };
  new ResizeObserver(liftDock).observe(panel);
  const setPanel = (open: boolean) => {
    panelOpen = open;
    liftDock();
    panel.classList.toggle('is-hidden', !open);
    panel.inert = !open;
    panelBtn.setAttribute('aria-expanded', String(open));
    panelBtn.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
  };
  setPanel(true);

  const options = sizes.map((size) => {
    const status = el('span', { className: 'size-status' }, [`${size.width} × ${size.height}`]);
    const shape = el('span', { className: 'size-shape' });
    const aspect = size.width / size.height;
    shape.style.width = `${Math.round(36 * Math.min(1, aspect))}px`;
    shape.style.height = `${Math.round(36 * Math.min(1, 1 / aspect))}px`;
    const button = el('button', { className: 'size-option', type: 'button' }, [
      el('span', { className: 'size-frame' }, [shape]),
      el('span', { className: 'size-name' }, [size.name]),
      status,
    ]);
    button.addEventListener('click', () => handlers.onSave(size));
    return { size, button, status };
  });
  const sheet = el('section', { className: 'sheet is-hidden', id: 'save-sheet' }, [
    el('h2', { className: 'sheet-title' }, ['Save wallpaper']),
    el('div', { className: 'size-options' }, options.map((o) => o.button)),
  ]);
  sheet.setAttribute('aria-label', 'Save wallpaper');
  let sheetOpen = false;
  let saving = false;
  const setSheet = (open: boolean) => {
    if (!open && saving) return; // stay put until the save finishes
    sheetOpen = open;
    sheet.classList.toggle('is-hidden', !open);
    sheet.inert = !open;
    saveBtn.setAttribute('aria-expanded', String(open));
  };
  setSheet(false);
  saveBtn.addEventListener('click', () => {
    setSheet(!sheetOpen);
    if (sheetOpen) options[0].button.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (sheetOpen && !sheet.contains(t) && !saveBtn.contains(t)) setSheet(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen) {
      setSheet(false);
      saveBtn.focus();
    }
  });

  playBtn.addEventListener('click', handlers.onTogglePlay);
  restartBtn.addEventListener('click', handlers.onRestart);
  panelBtn.addEventListener('click', () => setPanel(!panelOpen));
  undoBtn.addEventListener('click', handlers.onUndo);
  randomBtn.addEventListener('click', handlers.onRandomize);
  shareBtn.addEventListener('click', handlers.onShare);

  root.append(bar, sheet, panel, dock);
  liftDock();

  let toastTimer = 0;
  let spins = 0;

  const controls: Controls = {
    setPattern(p, next) {
      showPattern(p);
      controls.setValues(next);
    },
    setValues(next) {
      for (const c of inputs) c.set(next[c.spec.key]);
      for (const { preset, chip } of chips) {
        const active = Object.entries(preset.values).every(([k, v]) => next[k] === v);
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', String(active));
      }
    },
    setPalette(p) {
      paletteName.textContent = p.name;
      for (const { palette: q, swatch } of swatches) {
        const on = q.id === p.id;
        swatch.setAttribute('aria-checked', String(on));
        swatch.tabIndex = on ? 0 : -1;
      }
    },
    setSaveStatus(size, status) {
      saving = status?.state === 'working';
      for (const o of options) {
        const mine = o.size.id === size.id;
        o.button.disabled = saving && !mine;
        if (!mine) continue;
        o.button.classList.toggle('is-working', status?.state === 'working');
        o.button.setAttribute('aria-busy', String(status?.state === 'working'));
        o.button.style.setProperty(
          '--progress',
          status?.state === 'working' ? `${Math.round(status.progress * 100)}%` : '0%',
        );
        o.status.textContent =
          status === null
            ? `${size.width} × ${size.height}`
            : status.state === 'working'
              ? status.progress < 0.9
                ? 'Growing detail…'
                : 'Painting…'
              : status.state === 'done'
                ? 'Saved'
                : 'Couldn’t save, try again';
      }
    },
    setPlaying(playing) {
      playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      playBtn.title = playing ? 'Pause (P)' : 'Play (P)';
    },
    dismissHint() {
      if (hint.classList.contains('is-gone')) return;
      hint.classList.add('is-gone');
      window.setTimeout(() => (hint.hidden = true), 600);
    },
    setCanUndo(canUndo) {
      undoBtn.disabled = !canUndo;
    },
    toast(message) {
      clearTimeout(toastTimer);
      toastEl.textContent = message;
      toastEl.classList.add('is-shown');
      toastTimer = window.setTimeout(() => toastEl.classList.remove('is-shown'), 2200);
    },
    spinDice() {
      spins++;
      randomBtn.style.setProperty('--spin', `${spins * 180}deg`);
    },
    destroy() {
      bar.remove();
      sheet.remove();
      panel.remove();
      dock.remove();
    },
  };
  controls.setValues(values);
  controls.setPalette(palette);
  controls.setPlaying(true);
  controls.setCanUndo(false);
  return controls;
}

/** One row in the panel for one parameter. */
interface ParamControl {
  spec: ParamSpec;
  row: HTMLElement;
  set(value: number): void;
}

function sliderControl(spec: ParamSpec, handlers: ControlHandlers): ParamControl {
  const input = el('input', {
    type: 'range',
    min: String(spec.min),
    max: String(spec.max),
    step: String(spec.step),
    id: `param-${spec.key}`,
  });
  const readout = spec.format ? el('span', { className: 'readout' }) : null;
  const show = (value: number) => {
    if (!readout || !spec.format) return;
    const text = spec.format(value);
    readout.textContent = text;
    input.setAttribute('aria-valuetext', text);
  };
  input.addEventListener('input', () => {
    paintFill(input);
    show(Number(input.value));
    handlers.onParam(spec.key, Number(input.value));
  });
  const label = el('label', { htmlFor: input.id }, [spec.label]);
  if (readout) label.append(readout);
  const row = el('div', { className: 'slider' }, [label, input]);
  return {
    spec,
    row,
    set(value) {
      input.value = String(value);
      paintFill(input);
      show(value);
    },
  };
}

/** A row of named choices for a whole-number parameter (min…max). */
function choiceControl(spec: ParamSpec, handlers: ControlHandlers): ParamControl {
  const names = spec.options ?? [];
  const buttons = names.map((name, i) => {
    const value = spec.min + i;
    const button = el('button', { className: 'choice', type: 'button' }, [name]);
    button.setAttribute('role', 'radio');
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-checked') !== 'true') handlers.onParam(spec.key, value);
    });
    return { value, button };
  });
  const group = el('div', { className: 'choices' }, buttons.map((b) => b.button));
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', spec.label);
  group.addEventListener('keydown', (e) => {
    // Arrow keys move between choices, as in any radio group.
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = buttons.findIndex((b) => b.button.getAttribute('aria-checked') === 'true');
    const next = buttons[(i + step + buttons.length) % buttons.length];
    next.button.focus();
    handlers.onParam(spec.key, next.value);
  });
  const row = el('div', { className: 'slider choice-row' }, [el('span', { className: 'row-label' }, [spec.label]), group]);
  return {
    spec,
    row,
    set(value) {
      for (const { value: v, button } of buttons) {
        const on = v === value;
        button.setAttribute('aria-checked', String(on));
        button.tabIndex = on ? 0 : -1;
      }
    },
  };
}

/** An on/off switch for a parameter that is 0 or 1 (min and max). */
function switchControl(spec: ParamSpec, handlers: ControlHandlers): ParamControl {
  const button = el('button', { className: 'switch', type: 'button', id: `param-${spec.key}` });
  button.setAttribute('role', 'switch');
  button.append(el('span', { className: 'switch-knob' }));
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(on));
    handlers.onParam(spec.key, on ? spec.max : spec.min);
  });
  const row = el('div', { className: 'slider' }, [el('label', { htmlFor: button.id }, [spec.label]), button]);
  return {
    spec,
    row,
    set(value) {
      button.setAttribute('aria-checked', String(value === spec.max));
    },
  };
}

/** A diagonal sample of the palette: mostly background, then a band of each color. */
function swatchGradient(p: Palette): string {
  const stops = rampStops(p);
  const start = 34;
  const band = (100 - start) / (stops.length - 1);
  const parts = [`${stops[0]} 0 ${start}%`];
  stops.slice(1).forEach((c, i) => {
    parts.push(`${c} ${start + band * i}% ${start + band * (i + 1)}%`);
  });
  return `linear-gradient(135deg, ${parts.join(', ')})`;
}

/** Filled part of the track, via a CSS variable. */
function paintFill(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}
