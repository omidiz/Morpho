import type { WallpaperSize } from '../logic/export';
import type { ParamSpec, ParamValues } from '../logic/params';
import { openness, settlesOpen } from '../logic/sheet';
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
  /** The panel (and with it the pattern switcher) was opened or closed. */
  onPanel(open: boolean): void;
  /** The first-visit tip went away, so it needn't show again. */
  onWelcomeDone(): void;
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
  /** Whether the panel, with its pattern switcher, is showing. */
  readonly panelOpen: boolean;
  /** Where the live thumbnail of `pattern` goes in the switcher. */
  thumbSlot(pattern: Pattern): HTMLElement;
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
  /** The first-visit tip by the Randomize button. */
  showWelcome(): void;
  dismissWelcome(): void;
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

/** Phones get a bottom sheet; from this width up the panel is a card at the left. */
const WIDE = '(min-width: 720px)';
/** Where the card starts open. Shorter screens (a phone on its side) show the art first. */
const ROOMY = '(min-width: 720px) and (min-height: 560px)';

/**
 * Builds the controls inside `root`: a top bar with play/pause, restart and
 * save; a dock with undo, a big Randomize button and share; a panel with
 * live thumbnails to switch pattern, the pattern's preset chips, palette
 * swatches and one control per parameter in its schema (a slider, a switch
 * or a row of choices); and a "Save wallpaper" menu with one button per size.
 *
 * On phones the panel is a bottom sheet that rests closed, showing only the
 * dock, and is pulled up by its handle. On wider screens it is a card at
 * the left that the button by the wordmark folds away.
 */
export function buildControls(
  root: HTMLElement,
  { patterns, pattern, values, palettes, palette, sizes }: ControlOptions,
  handlers: ControlHandlers,
): Controls {
  const wide = matchMedia(WIDE);

  const playBtn = iconButton('', 'icon-btn');
  const restartBtn = iconButton(ICONS.restart, 'icon-btn', 'Start over with new seeds', 'Start over (R)');
  const saveBtn = iconButton(ICONS.save, 'icon-btn', 'Save wallpaper', 'Save wallpaper');
  saveBtn.setAttribute('aria-controls', 'save-menu');
  const panelBtn = iconButton(ICONS.sliders, 'icon-btn panel-btn', 'Hide controls', 'Controls');
  panelBtn.setAttribute('aria-controls', 'panel');

  const undoBtn = iconButton(ICONS.undo, 'icon-btn dock-btn', 'Undo randomize', 'Undo (Z)');
  const randomBtn = el('button', { className: 'randomize', type: 'button', title: 'Randomize (Space)' });
  randomBtn.innerHTML = ICONS.dice;
  randomBtn.append(el('span', {}, ['Randomize']));
  const shareBtn = iconButton(ICONS.share, 'icon-btn dock-btn', 'Share a link to this pattern', 'Share');
  const toastEl = el('p', { className: 'toast' });
  toastEl.setAttribute('role', 'status');
  const welcome = el('button', { className: 'welcome', type: 'button', hidden: true }, [
    'Tap Randomize, then save what you love',
  ]);
  welcome.setAttribute('aria-label', 'Tip: tap Randomize, then save what you love. Dismiss');
  const dock = el('div', { className: 'dock' }, [
    el('div', { className: 'dock-notes' }, [welcome, toastEl]),
    el('div', { className: 'dock-row' }, [undoBtn, randomBtn, shareBtn]),
  ]);

  const bar = el('header', { className: 'bar' }, [
    el('div', { className: 'bar-group' }, [el('span', { className: 'wordmark' }, ['morpho']), panelBtn]),
    el('div', { className: 'bar-group transport' }, [playBtn, restartBtn, saveBtn]),
  ]);

  // --- Pattern switcher: a live thumbnail per pattern ---------------------
  const tiles = patterns.map((p) => {
    const art = el('span', { className: 'thumb-art' });
    const tile = el('button', { className: 'thumb', type: 'button' }, [
      art,
      el('span', { className: 'thumb-name' }, [p.name]),
    ]);
    tile.addEventListener('click', () => {
      if (p.id !== current.id) handlers.onPattern(p);
    });
    return { pattern: p, tile, art };
  });
  const switcher = el('div', { className: 'switcher' }, tiles.map((t) => t.tile));
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Pattern');
  switcher.hidden = patterns.length < 2;

  const presetRow = el('div', { className: 'presets' });
  presetRow.setAttribute('role', 'group');
  presetRow.setAttribute('aria-label', 'Looks');
  const sliderBox = el('div', { className: 'sliders' });
  const hint = el('p', { className: 'hint' });

  let current = pattern;
  let chips: { preset: Preset; chip: HTMLButtonElement }[] = [];
  let inputs: ParamControl[] = [];

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
    el('div', { className: 'section-head' }, [el('span', {}, ['Colors']), paletteName]),
    swatchRow,
  ]);

  /** Fill the pattern-specific parts of the panel. */
  const showPattern = (p: Pattern) => {
    const switching = p !== current;
    current = p;
    for (const { pattern: q, tile } of tiles) tile.setAttribute('aria-pressed', String(q.id === p.id));
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
    if (switching) {
      // Restart the settle-in animation of the new controls.
      body.classList.remove('is-entering');
      void body.offsetWidth;
      body.classList.add('is-entering');
    }
  };
  // --- Panel: bottom sheet on phones, side card on wide screens ------------
  const grip = el('button', { className: 'grip', type: 'button' }, [el('span', { className: 'grip-bar' })]);
  grip.setAttribute('aria-controls', 'panel-body');
  const head = el('div', { className: 'panel-head' }, [grip]);
  const body = el('div', { className: 'panel-body', id: 'panel-body' }, [
    switcher,
    presetRow,
    paletteSection,
    sliderBox,
    hint,
  ]);
  showPattern(pattern);
  const panel = el('section', { className: 'panel', id: 'panel' }, [head, body]);
  panel.setAttribute('aria-label', 'Pattern controls');

  let panelOpen = matchMedia(ROOMY).matches;
  /** Distance the sheet moves down to close, leaving the dock showing. */
  let closedOffset = 0;
  let dragging = false;

  const placeSheet = (offset: number) => {
    panel.style.setProperty('--offset', `${offset}px`);
    panel.style.setProperty('--open', String(openness(offset, closedOffset)));
  };
  const measureSheet = () => {
    if (wide.matches) return;
    const padBottom = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
    closedOffset = Math.max(0, panel.offsetHeight - body.offsetTop - padBottom);
    if (!dragging) placeSheet(panelOpen ? 0 : closedOffset);
  };

  const setPanel = (open: boolean) => {
    const changed = open !== panelOpen;
    panelOpen = open;
    panel.classList.toggle('is-closed', !open);
    body.inert = !open;
    if (wide.matches) {
      panel.inert = !open;
      panel.style.removeProperty('--offset');
      panel.style.removeProperty('--open');
    } else {
      panel.inert = false; // the dock rides in its head
      measureSheet();
    }
    for (const b of [panelBtn, grip]) b.setAttribute('aria-expanded', String(open));
    panelBtn.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
    grip.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
    if (changed) handlers.onPanel(open);
  };

  // The dock lives in the sheet's head on phones and in a corner on wide screens.
  const layout = () => {
    if (wide.matches) root.append(dock);
    else head.append(dock);
    setPanel(panelOpen);
  };
  wide.addEventListener('change', () => {
    // Each layout starts in its natural state: sheet closed, card open where there's room.
    panelOpen = matchMedia(ROOMY).matches;
    layout();
    handlers.onPanel(panelOpen);
  });
  new ResizeObserver(measureSheet).observe(panel);

  grip.addEventListener('click', () => setPanel(!panelOpen));
  panelBtn.addEventListener('click', () => setPanel(!panelOpen));
  attachSheetDrag(head, {
    canDrag: () => !wide.matches,
    start() {
      dragging = true;
      panel.classList.add('is-dragging');
      return panelOpen ? 0 : closedOffset;
    },
    move: (offset) => placeSheet(Math.min(closedOffset, Math.max(0, offset))),
    end(offset, velocity) {
      dragging = false;
      panel.classList.remove('is-dragging');
      setPanel(settlesOpen(offset, closedOffset, velocity));
      measureSheet();
    },
  });

  // --- Save menu ----------------------------------------------------------
  const options = sizes.map((size) => {
    const status = el('span', { className: 'size-status' }, [`${size.width} × ${size.height}`]);
    const shape = el('span', { className: 'size-shape' });
    const aspect = size.width / size.height;
    shape.style.width = `${Math.round(30 * Math.min(1, aspect))}px`;
    shape.style.height = `${Math.round(30 * Math.min(1, 1 / aspect))}px`;
    const button = el('button', { className: 'size-option', type: 'button' }, [
      el('span', { className: 'size-frame' }, [shape]),
      el('span', { className: 'size-name' }, [size.name]),
      status,
    ]);
    button.addEventListener('click', () => handlers.onSave(size));
    return { size, button, status };
  });
  const saveMenu = el('section', { className: 'save-menu is-hidden', id: 'save-menu' }, [
    el('h2', { className: 'save-title' }, ['Save wallpaper']),
    el('div', { className: 'size-options' }, options.map((o) => o.button)),
  ]);
  saveMenu.setAttribute('aria-label', 'Save wallpaper');
  let menuOpen = false;
  let saving = false;
  const setMenu = (open: boolean) => {
    if (!open && saving) return; // stay put until the save finishes
    menuOpen = open;
    saveMenu.classList.toggle('is-hidden', !open);
    saveMenu.inert = !open;
    saveBtn.setAttribute('aria-expanded', String(open));
  };
  setMenu(false);
  saveBtn.addEventListener('click', () => {
    setMenu(!menuOpen);
    if (menuOpen) {
      dismissWelcome();
      options[0].button.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (menuOpen && !saveMenu.contains(t) && !saveBtn.contains(t)) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) {
      setMenu(false);
      saveBtn.focus();
    }
  });

  // --- First-visit tip ----------------------------------------------------
  let welcomeShown = false;
  const dismissWelcome = () => {
    if (!welcomeShown) return;
    welcomeShown = false;
    welcome.classList.remove('is-shown');
    window.setTimeout(() => (welcome.hidden = true), 400);
    handlers.onWelcomeDone();
  };
  welcome.addEventListener('click', dismissWelcome);

  playBtn.addEventListener('click', handlers.onTogglePlay);
  restartBtn.addEventListener('click', handlers.onRestart);
  undoBtn.addEventListener('click', handlers.onUndo);
  randomBtn.addEventListener('click', () => {
    handlers.onRandomize();
  });
  shareBtn.addEventListener('click', handlers.onShare);

  root.append(bar, panel, saveMenu);
  layout();

  let toastTimer = 0;
  let spins = 0;

  const controls: Controls = {
    get panelOpen() {
      return panelOpen;
    },
    thumbSlot(p) {
      return tiles.find((t) => t.pattern.id === p.id)!.art;
    },
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
      for (const { art } of tiles) art.style.background = p.background;
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
    showWelcome() {
      if (welcomeShown) return;
      welcomeShown = true;
      welcome.hidden = false;
      // Let the art show itself first.
      window.setTimeout(() => welcomeShown && welcome.classList.add('is-shown'), 900);
    },
    dismissWelcome,
    destroy() {
      bar.remove();
      saveMenu.remove();
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

function iconButton(icon: string, className: string, label = '', title = ''): HTMLButtonElement {
  const button = el('button', { className, type: 'button' });
  button.innerHTML = icon;
  if (label) button.setAttribute('aria-label', label);
  if (title) button.title = title;
  return button;
}

interface SheetDrag {
  canDrag(): boolean;
  /** A drag has begun; returns the sheet's offset at the start. */
  start(): number;
  move(offset: number): void;
  /** Let go at `offset`, moving at `velocity` px/ms (positive = down). */
  end(offset: number, velocity: number): void;
}

/** Pixels a finger moves before a press on the head becomes a drag (and not a tap). */
const DRAG_SLOP = 8;
/** How far back a release looks to measure a flick. */
const FLICK_WINDOW_MS = 120;

/**
 * Drag the sheet up and down by its head. A press on a button there stays
 * a tap unless the finger moves; once it does, the sheet takes over and the
 * button's click is dropped.
 */
function attachSheetDrag(head: HTMLElement, drag: SheetDrag): void {
  let press: {
    id: number;
    y0: number;
    from: number;
    active: boolean;
    offset: number;
    samples: { y: number; t: number }[];
  } | null = null;

  /** The last press turned into a drag. */
  let dragged = false;

  head.addEventListener('pointerdown', (e) => {
    dragged = false;
    if (press || !drag.canDrag() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press = { id: e.pointerId, y0: e.clientY, from: 0, active: false, offset: 0, samples: [] };
  });
  head.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dy = e.clientY - press.y0;
    if (!press.active) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      press.active = true;
      dragged = true;
      press.from = drag.start();
      head.setPointerCapture(e.pointerId);
    }
    press.offset = press.from + dy;
    press.samples.push({ y: e.clientY, t: e.timeStamp });
    if (press.samples.length > 8) press.samples.shift();
    drag.move(press.offset);
  });
  const finish = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    if (!p.active) return;
    // Speed over the last moment only: a drag that stops before letting go is no flick.
    const last = p.samples.at(-1)!;
    const first = p.samples.find((s) => last.t - s.t <= FLICK_WINDOW_MS) ?? last;
    const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
    drag.end(p.offset, velocity);
  };
  head.addEventListener('pointerup', finish);
  head.addEventListener('pointercancel', finish);
  // A drag that started on a button must not also press it.
  head.addEventListener(
    'click',
    (e) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
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
