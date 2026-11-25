/** A frame at 60 Hz, the unit the rates below are tuned in. */
const FRAME_60 = 1000 / 60;
/** A frame longer than this is either a pause (tab switch, debugger) or a very slow device. */
const PAUSE_MS = 250;
/** This many long frames in a row means a slow device, not a pause. */
const SLOW_STREAK = 3;

/**
 * Keeps frames smooth by scaling down simulation work when frames start to
 * drop. Feed it each frame's duration; it returns a work budget in (0, 1].
 *
 * The display's refresh interval is estimated from the fastest recent frames,
 * so this works on 60 Hz and 120 Hz screens alike. It backs off and recovers
 * at a rate per second, not per frame, so a device managing only a few
 * frames a second still settles in a few seconds.
 */
export class FrameGovernor {
  budget = 1;
  private avg = FRAME_60;
  private refresh = FRAME_60;
  private longFrames = 0;

  constructor(
    private readonly minBudget = 0.15,
  ) {}

  update(dtMs: number): number {
    if (!(dtMs > 0)) return this.budget;
    if (dtMs > PAUSE_MS) {
      // A lone long frame is a pause; several in a row is a device that can't keep up.
      if (++this.longFrames < SLOW_STREAK) return this.budget;
      dtMs = PAUSE_MS;
    } else {
      this.longFrames = 0;
    }
    // Fastest frame seen recently ≈ refresh interval. Drift upward slowly so
    // a display that changes rate (power saving) is picked up eventually.
    this.refresh = Math.min(dtMs, this.refresh + 0.02);
    const frames = dtMs / FRAME_60;
    this.avg += (dtMs - this.avg) * (1 - 0.9 ** frames);
    if (this.avg > this.refresh * 1.4) {
      this.budget = Math.max(this.minBudget, this.budget * 0.95 ** frames);
    } else if (this.avg < this.refresh * 1.15) {
      this.budget = Math.min(1, this.budget + 0.005 * frames);
    }
    return this.budget;
  }
}

/**
 * Turns a steps-per-60Hz-frame rate into whole steps for this frame,
 * carrying the fractional remainder so the long-run rate is exact.
 */
export class StepAccumulator {
  private carry = 0;

  next(ratePer60HzFrame: number, dtMs: number, budget: number, maxSteps = 48): number {
    const dt = Math.min(Math.max(dtMs, 0), 1000 / 30); // never try to catch up on long frames
    this.carry += ratePer60HzFrame * (dt / FRAME_60) * budget;
    const steps = Math.min(maxSteps, Math.floor(this.carry));
    this.carry = Math.min(this.carry - steps, 1);
    return steps;
  }
}

/** Device pixels per CSS pixel the canvas may step down through, from sharpest. */
export const PIXEL_RATIO_NOTCHES = [2, 1.5, 1] as const;

/**
 * Lowers the canvas resolution when a pattern can't keep up even after it
 * has trimmed its own work. If frames stay slow for a couple of seconds, the
 * pixel ratio drops one notch. It never climbs back on its own: a new
 * pattern starts again from the top with `reset`.
 *
 * Feed it frames only while something is animating (not while paused or
 * saving, when frame times say nothing about the device).
 */
export class ResolutionGovernor {
  /** Most device pixels per CSS pixel to use now; Infinity until frames prove slow. */
  cap = Infinity;
  private avg = FRAME_60;
  private refresh = FRAME_60;
  private slowMs = 0;
  /** Time left before frames count: a fresh start (shader compiles, a first big layout) is not the device. */
  private graceMs = 0;

  constructor(
    private readonly settleMs = 1500,
    private readonly slowForMs = 2000,
  ) {
    this.reset();
  }

  reset(): void {
    this.cap = Infinity;
    this.avg = FRAME_60;
    this.slowMs = 0;
    this.graceMs = this.settleMs;
  }

  /** One frame of `dtMs` at pixel ratio `ratio`. Returns true when `cap` has just dropped. */
  update(dtMs: number, ratio: number): boolean {
    if (!(dtMs > 0) || dtMs > PAUSE_MS * 4) return false;
    this.refresh = Math.min(dtMs, this.refresh + 0.02);
    if (this.graceMs > 0) {
      this.graceMs -= dtMs;
      return false;
    }
    this.avg += (Math.min(dtMs, PAUSE_MS) - this.avg) * 0.1;
    this.slowMs = this.avg > this.refresh * 1.8 ? this.slowMs + dtMs : Math.max(0, this.slowMs - dtMs);
    if (this.slowMs < this.slowForMs) return false;
    const next = PIXEL_RATIO_NOTCHES.find((n) => n < ratio - 0.01);
    if (next === undefined) return false;
    this.cap = next;
    this.slowMs = 0;
    this.avg = FRAME_60;
    this.graceMs = this.settleMs; // let the new size settle before judging again
    return true;
  }
}
