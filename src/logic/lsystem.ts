/**
 * L-systems: a word of symbols is rewritten by rules, generation by
 * generation, then read by a "turtle" that walks and draws to make a plant.
 *
 * Every symbol carries a stable id. A symbol that no rule touches (a turn, a
 * branch bracket) keeps its id from one generation to the next; a rewritten
 * symbol's children get ids derived from it. Random choices (which rule to
 * use, how far a branch bends) are keyed to these ids rather than drawn from
 * a running sequence, so each generation keeps the shape of the one before
 * and the plant can grow smoothly from one to the next.
 *
 * Turtle symbols:
 *   F      draw forward one segment
 *   + -    turn left / right by the branching angle
 *   < >    turn left / right by the (smaller) kink angle
 *   |      turn around
 *   [ ]    start / end a branch
 * Anything else (X, Y, …) only takes part in rewriting.
 */
import { mixSeed, signedHash, unitHash } from './rng';

/** One alternative for a stochastic rule. */
export interface Successor {
  to: string;
  weight: number;
}

/** symbol → replacement, or weighted alternatives picked per symbol. */
export type Rules = Readonly<Record<string, string | readonly Successor[]>>;

export interface LSystem {
  axiom: string;
  rules: Rules;
}

/** A word: its symbols and one stable id per symbol. */
export interface Word {
  symbols: string;
  ids: Uint32Array;
}

// Salts keep the different random choices independent of each other.
const CHOICE = 0x51ed27;
const TURN = 0x7a11;
const BRANCH = 0xb4a7c;
const WOBBLE = 0x30bb1e;

export function axiomWord(axiom: string, seed: number): Word {
  const ids = new Uint32Array(axiom.length);
  for (let i = 0; i < axiom.length; i++) ids[i] = mixSeed(seed, i);
  return { symbols: axiom, ids };
}

/** The successor `rule` gives the symbol with `id`. */
function successor(rule: string | readonly Successor[], id: number): string {
  if (typeof rule === 'string') return rule;
  const total = rule.reduce((sum, s) => sum + s.weight, 0);
  let r = unitHash(id, CHOICE) * total;
  for (const s of rule) {
    r -= s.weight;
    if (r < 0) return s.to;
  }
  return rule[rule.length - 1].to;
}

/** Length of `rewrite(word, rules)`, and how many segments (F) it has, without building it. */
export function rewrittenSize(word: Word, rules: Rules): { symbols: number; segments: number } {
  let symbols = 0;
  let segments = 0;
  for (let i = 0; i < word.symbols.length; i++) {
    const c = word.symbols[i];
    const rule = rules[c];
    const to = rule === undefined ? c : successor(rule, word.ids[i]);
    symbols += to.length;
    for (let j = 0; j < to.length; j++) if (to.charCodeAt(j) === 70 /* F */) segments++;
  }
  return { symbols, segments };
}

/** One generation: every symbol with a rule is replaced, all at once. */
export function rewrite(word: Word, rules: Rules): Word {
  const parts: string[] = [];
  const ids = new Uint32Array(rewrittenSize(word, rules).symbols);
  let k = 0;
  for (let i = 0; i < word.symbols.length; i++) {
    const c = word.symbols[i];
    const id = word.ids[i];
    const rule = rules[c];
    if (rule === undefined) {
      parts.push(c);
      ids[k++] = id;
      continue;
    }
    const to = successor(rule, id);
    parts.push(to);
    for (let j = 0; j < to.length; j++) ids[k++] = mixSeed(id, j + 1);
  }
  return { symbols: parts.join(''), ids };
}

/**
 * Words for generations 0 (the axiom) through `generations`. Stops early
 * rather than make a word with more than `maxSegments` segments, so the
 * result can be shorter than asked: its last word is the most grown one that fits.
 */
export function grow(system: LSystem, generations: number, seed: number, maxSegments = Infinity): Word[] {
  return growMore([axiomWord(system.axiom, seed)], system, generations, maxSegments);
}

/** Continue `words` (from `grow`) up to `generations`, within `maxSegments`. Returns a new array. */
export function growMore(
  words: readonly Word[],
  system: LSystem,
  generations: number,
  maxSegments = Infinity,
): Word[] {
  const out = words.slice();
  while (out.length <= generations) {
    const last = out[out.length - 1];
    if (rewrittenSize(last, system.rules).segments > maxSegments) break;
    out.push(rewrite(last, system.rules));
  }
  return out;
}

export interface TurtleOptions {
  /** Turn for + and -, radians. */
  angle: number;
  /** Turn for < and >, radians. */
  kink?: number;
  /** Length of one F. */
  length: number;
  /** 0 = textbook-perfect, 1 = quite wild. */
  randomness: number;
  /** Starting direction, radians clockwise from straight up. */
  heading?: number;
  /** Most a segment's direction drifts at randomness 1, radians. */
  wobble?: number;
}

/**
 * The plant as a tree of straight segments, before wind. Parents always come
 * before their children. Headings are radians clockwise from straight up.
 */
export interface Skeleton {
  count: number;
  /** Index of the segment this one grows from, or -1 at the root. */
  parent: Int32Array;
  heading: Float32Array;
  length: Float32Array;
  /** Distance along the branches from the root to where the segment starts. */
  start: Float32Array;
  /** Segments growing directly from this one. 0 = a tip. */
  children: Uint16Array;
  /** Tips at the end of this segment and everything beyond it. */
  tips: Uint32Array;
  /** Stable id of the F the segment came from. */
  id: Uint32Array;
  /** Tips in the whole plant. */
  totalTips: number;
  /** Longest distance from the root to the end of a segment. */
  reach: number;
}

/** How much the angle of each turn varies at randomness 1 (fraction of the turn). */
const TURN_JITTER = 0.45;
/** How much branch lengths vary at randomness 1 (log scale). */
const BRANCH_JITTER = 0.5;

/** Walk the word and build the skeleton. */
export function turtle(word: Word, o: TurtleOptions): Skeleton {
  const { symbols, ids } = word;
  const parent: number[] = [];
  const heading: number[] = [];
  const length: number[] = [];
  const start: number[] = [];
  const segId: number[] = [];
  const stack: { h: number; p: number; scale: number; dist: number }[] = [];
  const kink = o.kink ?? 0;
  const wobble = (o.wobble ?? 0) * o.randomness;
  const turn = (base: number, id: number) => base * (1 + o.randomness * TURN_JITTER * signedHash(id, TURN));

  let h = o.heading ?? 0;
  let p = -1;
  let scale = 1;
  let dist = 0;
  for (let i = 0; i < symbols.length; i++) {
    const id = ids[i];
    switch (symbols[i]) {
      case 'F': {
        h += wobble * signedHash(id, WOBBLE);
        const len = o.length * scale;
        parent.push(p);
        heading.push(h);
        length.push(len);
        start.push(dist);
        segId.push(id);
        p = parent.length - 1;
        dist += len;
        break;
      }
      case '+':
        h -= turn(o.angle, id);
        break;
      case '-':
        h += turn(o.angle, id);
        break;
      case '<':
        h -= turn(kink, id);
        break;
      case '>':
        h += turn(kink, id);
        break;
      case '|':
        h += Math.PI;
        break;
      case '[':
        stack.push({ h, p, scale, dist });
        scale *= Math.exp(o.randomness * BRANCH_JITTER * signedHash(id, BRANCH));
        break;
      case ']': {
        const s = stack.pop();
        if (s) ({ h, p, scale, dist } = s);
        break;
      }
    }
  }

  const count = parent.length;
  const skel: Skeleton = {
    count,
    parent: Int32Array.from(parent),
    heading: Float32Array.from(heading),
    length: Float32Array.from(length),
    start: Float32Array.from(start),
    children: new Uint16Array(count),
    tips: new Uint32Array(count),
    id: Uint32Array.from(segId),
    totalTips: 0,
    reach: 0,
  };
  for (let i = 0; i < count; i++) {
    const q = skel.parent[i];
    if (q >= 0 && skel.children[q] < 0xffff) skel.children[q]++;
    skel.reach = Math.max(skel.reach, skel.start[i] + skel.length[i]);
  }
  // Children come after parents, so one backward pass adds up the tips.
  for (let i = count - 1; i >= 0; i--) {
    if (skel.tips[i] === 0) skel.tips[i] = 1;
    const q = skel.parent[i];
    if (q >= 0) skel.tips[q] += skel.tips[i];
    else skel.totalTips += skel.tips[i];
  }
  return skel;
}

/**
 * Thickness of a segment relative to the trunk (1), from the number of tips
 * it carries: the cross-sections of the branches add up to the trunk's, as in
 * real trees, so twigs are thinnest.
 */
export function thickness(skel: Skeleton, i: number): number {
  return skel.totalTips > 0 ? Math.sqrt(skel.tips[i] / skel.totalTips) : 1;
}

/** Where each segment ends up once the wind has bent it. Plant space: root at (0, 0), y down. */
export interface Layout {
  x0: Float32Array;
  y0: Float32Array;
  x1: Float32Array;
  y1: Float32Array;
  /** Final direction of each segment. */
  heading: Float32Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Total bend, radians, along a whole flexible branch at wind 1. */
const WIND_BEND = 2.2;

/**
 * Lay out the skeleton under a wind blowing to the right (`wind` 0 = still,
 * 1 = a gale; negative blows left). Thin branches bend more than thick
 * ones, and a branch bends most when it stands across the wind. The bend is
 * spread by length, so a plant bends the same at every generation.
 */
export function layout(skel: Skeleton, wind: number): Layout {
  const n = skel.count;
  const x0 = new Float32Array(n);
  const y0 = new Float32Array(n);
  const x1 = new Float32Array(n);
  const y1 = new Float32Array(n);
  const heading = new Float32Array(n);
  const bend = new Float32Array(n);
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  const k = skel.reach > 0 ? (wind * WIND_BEND) / skel.reach : 0;
  for (let i = 0; i < n; i++) {
    const p = skel.parent[i];
    const sx = p < 0 ? 0 : x1[p];
    const sy = p < 0 ? 0 : y1[p];
    const pb = p < 0 ? 0 : bend[p];
    let h = skel.heading[i] + pb;
    const flex = 1 - 0.7 * thickness(skel, i);
    const d = k * flex * skel.length[i] * Math.cos(h);
    h += d;
    bend[i] = pb + d;
    heading[i] = h;
    const ex = sx + Math.sin(h) * skel.length[i];
    const ey = sy - Math.cos(h) * skel.length[i];
    x0[i] = sx;
    y0[i] = sy;
    x1[i] = ex;
    y1[i] = ey;
    if (ex < minX) minX = ex;
    if (ex > maxX) maxX = ex;
    if (ey < minY) minY = ey;
    if (ey > maxY) maxY = ey;
  }
  return { x0, y0, x1, y1, heading, minX, maxX, minY, maxY };
}
