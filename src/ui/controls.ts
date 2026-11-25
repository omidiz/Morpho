import type { ParamValues } from '../logic/params';
import type { Pattern, Preset } from '../patterns/types';

export interface ControlHandlers {
  onParam(key: string, value: number): void;
  onPreset(preset: Preset): void;
  onTogglePlay(): void;
  onRestart(): void;
}

export interface Controls {
  /** Reflect new values in the sliders and preset chips. */
  setValues(values: ParamValues): void;
  setPlaying(playing: boolean): void;
  /** Called once someone has painted, so the hint can go away. */
  dismissHint(): void;
  destroy(): void;
}

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1.6"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6c0-1 1.1-1.6 1.9-1.1l9 6.4c.7.5.7 1.6 0 2.1l-9 6.4c-.8.6-1.9 0-1.9-1V5.6z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4h4"/></svg>',
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
 * Builds the controls for one pattern inside `root`: a top bar with
 * play/pause, restart and a panel toggle, and a panel with preset chips and
 * one slider per parameter in the pattern's schema.
 */
export function buildControls(
  root: HTMLElement,
  pattern: Pattern,
  values: ParamValues,
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

  const bar = el('header', { className: 'bar' }, [
    el('span', { className: 'wordmark' }, ['morpho']),
    el('div', { className: 'transport' }, [playBtn, restartBtn, panelBtn]),
  ]);

  const chips = pattern.presets.map((preset) => {
    const chip = el('button', { className: 'chip', type: 'button' }, [preset.name]);
    chip.addEventListener('click', () => handlers.onPreset(preset));
    return { preset, chip };
  });
  const presetRow = el('div', { className: 'presets' }, chips.map((c) => c.chip));
  presetRow.setAttribute('role', 'group');
  presetRow.setAttribute('aria-label', 'Looks');

  const sliders = pattern.params.map((spec) => {
    const input = el('input', {
      type: 'range',
      min: String(spec.min),
      max: String(spec.max),
      step: String(spec.step),
      id: `param-${spec.key}`,
    });
    input.addEventListener('input', () => {
      paintFill(input);
      handlers.onParam(spec.key, Number(input.value));
    });
    const row = el('div', { className: 'slider' }, [
      el('label', { htmlFor: input.id }, [spec.label]),
      input,
    ]);
    return { spec, input, row };
  });

  const hint = el('p', { className: 'hint' }, ['Touch the pattern to plant new seeds.']);
  const panel = el('section', { className: 'panel', id: 'panel' }, [
    presetRow,
    el('div', { className: 'sliders' }, sliders.map((s) => s.row)),
    hint,
  ]);
  panel.setAttribute('aria-label', 'Pattern controls');

  let panelOpen = true;
  const setPanel = (open: boolean) => {
    panelOpen = open;
    panel.classList.toggle('is-hidden', !open);
    panel.inert = !open;
    panelBtn.setAttribute('aria-expanded', String(open));
    panelBtn.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
  };
  setPanel(true);

  playBtn.addEventListener('click', handlers.onTogglePlay);
  restartBtn.addEventListener('click', handlers.onRestart);
  panelBtn.addEventListener('click', () => setPanel(!panelOpen));

  root.append(bar, panel);

  const controls: Controls = {
    setValues(next) {
      for (const { spec, input } of sliders) {
        input.value = String(next[spec.key]);
        paintFill(input);
      }
      for (const { preset, chip } of chips) {
        const active = Object.entries(preset.values).every(([k, v]) => next[k] === v);
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', String(active));
      }
    },
    setPlaying(playing) {
      playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      playBtn.title = playing ? 'Pause' : 'Play';
    },
    dismissHint() {
      if (hint.classList.contains('is-gone')) return;
      hint.classList.add('is-gone');
      window.setTimeout(() => (hint.hidden = true), 600);
    },
    destroy() {
      bar.remove();
      panel.remove();
    },
  };
  controls.setValues(values);
  controls.setPlaying(true);
  return controls;
}

/** Filled part of the track, via a CSS variable. */
function paintFill(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}
