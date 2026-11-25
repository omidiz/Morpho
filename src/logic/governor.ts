/**
 * Keeps frames smooth by scaling down simulation work when frames start to
 * drop. Feed it each frame's duration; it returns a work budget in (0, 1].
 *
 * The display's refresh interval is estimated from the fastest recent frames,
 * so this works on 60 Hz and 120 Hz screens alike.
 */
export class FrameGovernor {
  budget = 1;
  private avg = 1000 / 60;
  private refresh = 1000 / 60;

  constructor(
    private readonly minBudget = 0.15,
  ) {}

  update(dtMs: number): number {
    // Ignore pauses (tab switches, debugger) and nonsense values.
    if (!(dtMs > 0) || dtMs > 250) return this.budget;
    // Fastest frame seen recently ≈ refresh interval. Drift upward slowly so
    // a display that changes rate (power saving) is picked up eventually.
    this.refresh = Math.min(dtMs, this.refresh + 0.02);
    this.avg += (dtMs - this.avg) * 0.1;
    if (this.avg > this.refresh * 1.4) {
      this.budget = Math.max(this.minBudget, this.budget * 0.95);
    } else if (this.avg < this.refresh * 1.15) {
      this.budget = Math.min(1, this.budget + 0.005);
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
    this.carry += ratePer60HzFrame * (dt / (1000 / 60)) * budget;
    const steps = Math.min(maxSteps, Math.floor(this.carry));
    this.carry = Math.min(this.carry - steps, 1);
    return steps;
  }
}
