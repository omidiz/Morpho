/** Time for one generation to grow into the next. */
export const GENERATION_MS = 650;
/** Time for leaves and blossoms to open once the plant has grown. */
export const BLOOM_MS = 900;
/** Time for them to fold away when the plant grows further. */
const FOLD_MS = 250;

/**
 * Where a plant is in its growth animation: generation `shown` is fully
 * grown and `t` (0 to 1) is how far the next one has grown over it. Once
 * the target is reached, `bloom` goes from 0 to 1 as leaves open.
 */
export class Growth {
  /** Fully grown generation; -1 before anything has sprouted. */
  shown = -1;
  t = 0;
  bloom = 0;

  constructor(
    public target: number,
    private delay = 0,
  ) {}

  get done(): boolean {
    return this.shown >= this.target && this.bloom >= 1;
  }

  /** Grow to `generation` from here (or cut back to it at once). */
  setTarget(generation: number): void {
    if (generation < this.shown) {
      this.shown = generation;
      this.t = 0;
    } else if (generation > this.shown && this.shown >= this.target) {
      this.t = 0; // was finished: start the next generation from scratch
    }
    this.target = generation;
  }

  /** Jump to the end: fully grown and in bloom. */
  finish(): void {
    this.delay = 0;
    this.shown = this.target;
    this.t = 0;
    this.bloom = 1;
  }

  /**
   * Move time on by `dtMs`. `isEmpty(g)` says generation g has nothing to
   * draw, so it is passed straight through. Returns whether anything changed.
   */
  step(dtMs: number, isEmpty: (generation: number) => boolean = () => false): boolean {
    if (this.done || dtMs <= 0) return false;
    if (this.delay > 0) {
      this.delay -= dtMs;
      if (this.delay > 0) return false;
      dtMs = -this.delay;
      this.delay = 0;
    }
    if (this.shown < this.target) {
      this.bloom = Math.max(0, this.bloom - dtMs / FOLD_MS);
      while (this.shown < this.target && isEmpty(this.shown + 1)) this.shown++;
      this.t += dtMs / GENERATION_MS;
      while (this.t >= 1 && this.shown < this.target) {
        this.shown++;
        this.t -= 1;
        while (this.shown < this.target && isEmpty(this.shown + 1)) this.shown++;
      }
      if (this.shown >= this.target) this.t = 0;
    } else {
      this.bloom = Math.min(1, this.bloom + dtMs / BLOOM_MS);
    }
    return true;
  }
}
