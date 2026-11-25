/**
 * Shaders for the slime mold. Two kinds of texture:
 *
 * - Explorers: RGBA32F, one texel each, 1024 to a row: (x, y, heading, 0),
 *   with x and y 0..1 across the map (y up) and heading in radians.
 * - Trail: one float channel, one texel per map cell, LINEAR + REPEAT so
 *   feelers read smoothly and the map wraps around at the edges.
 */

import { MAX_FOOD } from '../../logic/physarum';
import { HASH_GLSL, RAMP_GLSL } from '../gl';

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/**
 * Move every explorer one step: feel the trail ahead, to the left and to the
 * right, turn toward the strongest, walk on. Drawn over the explorer texture
 * (only the rows in use), reading the previous state.
 *
 * Feelers can't tell trail apart above uCap: where a crowd piles up the
 * trail feels flat, explorers wander out along the veins again, and the
 * network keeps spreading instead of collapsing into blobs and rings.
 * Food sources (x, y in cells, strength 0..1) pull from further away.
 *
 * uBounce: 0 wraps around the edges (the screen is a torus), 1 turns back
 * at them (exports, where the far edge is not what lies beyond).
 */
export const AGENT_FS = HEADER + HASH_GLSL + /* glsl */ `
uniform sampler2D uAgents;
uniform sampler2D uTrail;
uniform vec2 uGrid;
uniform float uAngle;
uniform float uReach;
uniform float uTurn;
uniform float uSpeed;
uniform uint uFrame;
uniform int uBounce;
uniform float uCap;
uniform vec4 uFood[${MAX_FOOD}];
uniform int uFoodCount;
uniform float uFoodReach;
uniform float uFoodPull;
out vec4 outAgent;

const float TAU = 6.28318530718;

float feel(vec2 p, float h) {
  vec2 q = p + vec2(cos(h), sin(h)) * uReach / uGrid;
  float v = min(texture(uTrail, q).r, uCap);
  // Food is felt from further off, and above the cap, so the network bends toward it.
  vec2 cell = q * uGrid;
  for (int i = 0; i < ${MAX_FOOD}; i++) {
    if (i >= uFoodCount) break;
    vec2 d = cell - uFood[i].xy;
    v += uFoodPull * uFood[i].z * exp(-dot(d, d) / (uFoodReach * uFoodReach));
  }
  return v;
}

void main() {
  vec2 id = floor(gl_FragCoord.xy);
  vec4 a = texelFetch(uAgents, ivec2(id), 0);
  vec2 p = a.xy;
  float h = a.z;
  float ahead = feel(p, h);
  float left = feel(p, h + uAngle);
  float right = feel(p, h - uAngle);
  float r = hash(id, uFrame * 3u);
  float turn = uTurn * (0.75 + 0.5 * hash(id, uFrame * 3u + 1u));
  if (ahead >= left && ahead >= right) {
    // On course. A faint wobble keeps lines from going ruler-straight.
    h += (r - 0.5) * uTurn * 0.15;
  } else if (ahead < left && ahead < right) {
    h += (r < 0.5 ? -1.0 : 1.0) * turn;
  } else if (left > right) {
    h += turn;
  } else {
    h -= turn;
  }
  p += vec2(cos(h), sin(h)) * uSpeed / uGrid;
  if (uBounce == 1) {
    if (p.x < 0.0 || p.x >= 1.0 || p.y < 0.0 || p.y >= 1.0) {
      p = clamp(p, vec2(0.0), vec2(0.99999));
      h = hash(id, uFrame * 3u + 2u) * TAU;
    }
  } else {
    p = fract(p);
  }
  h -= floor(h / TAU) * TAU;
  outAgent = vec4(p, h, 0.0);
}`;

/** One point per explorer, placed by its index (no vertex buffers needed). */
export const DEPOSIT_VS = HEADER + /* glsl */ `
uniform sampler2D uAgents;
uniform int uWidth;

void main() {
  ivec2 c = ivec2(gl_VertexID % uWidth, gl_VertexID / uWidth);
  vec2 p = texelFetch(uAgents, c, 0).xy;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

/** Each point adds uAmount of trail (drawn with additive blending). */
export const DEPOSIT_FS = HEADER + /* glsl */ `
uniform float uAmount;
out vec4 outColor;

void main() {
  outColor = vec4(uAmount, 0.0, 0.0, 0.0);
}`;

/**
 * Spread some of the trail (uDiffuse) over each cell's 3×3 neighborhood,
 * let it fade, and let each food source (x, y in cells, strength 0..1)
 * give off a steady glow.
 * The trail tops out at uCap, only to keep half floats in range.
 */
export const DIFFUSE_FS = HEADER + /* glsl */ `
uniform sampler2D uTrail;
uniform vec2 uGrid;
uniform float uKeep;
uniform float uDiffuse;
uniform float uCap;
uniform vec4 uFood[${MAX_FOOD}];
uniform int uFoodCount;
uniform float uFoodRadius;
uniform float uFoodRate;
out vec4 outColor;

void main() {
  vec2 t = 1.0 / uGrid;
  vec2 uv = gl_FragCoord.xy * t;
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      sum += texture(uTrail, uv + vec2(x, y) * t).r;
    }
  }
  float c = texture(uTrail, uv).r;
  float v = mix(c, sum / 9.0, uDiffuse) * uKeep;
  for (int i = 0; i < ${MAX_FOOD}; i++) {
    if (i >= uFoodCount) break;
    vec2 d = gl_FragCoord.xy - uFood[i].xy;
    float d2 = dot(d, d);
    float r2 = uFoodRadius * uFoodRadius;
    if (d2 < r2 * 9.0) v += uFoodRate * uFood[i].z * exp(-d2 / r2);
  }
  outColor = vec4(min(v, uCap), 0.0, 0.0, 1.0);
}`;

/**
 * Copy part of one trail onto another of a different size, smoothly:
 * destination (0..1) maps to source uOrigin + dst · uSpan.
 */
export const RESAMPLE_FS = HEADER + /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uDst;
uniform vec2 uOrigin;
uniform vec2 uSpan;
out vec4 outColor;

void main() {
  vec2 uv = uOrigin + gl_FragCoord.xy / uDst * uSpan;
  outColor = vec4(texture(uSrc, uv).r, 0.0, 0.0, 1.0);
}`;

/**
 * Fill an explorer texture from another one. Explorer j copies explorer
 * j mod uSrcCount of the source; repeats (j ≥ uSrcCount) are nudged a
 * little in place and heading so they spread out. Positions are mapped
 * through the window (uOrigin, uSpan) of the source map; anyone who lands
 * outside it clones a random explorer from inside instead, so the crowd
 * keeps its layout. Used to grow or shrink the crowd without a jolt, and to
 * fill an export from the screen.
 */
export const SPAWN_FS = HEADER + HASH_GLSL + /* glsl */ `
uniform sampler2D uSrc;
uniform int uSrcWidth;
uniform int uSrcCount;
uniform int uDstWidth;
uniform vec2 uOrigin;
uniform vec2 uSpan;
uniform vec2 uJitter;
out vec4 outAgent;

const float TAU = 6.28318530718;

bool outside(vec2 p) {
  return p.x < 0.0 || p.x >= 1.0 || p.y < 0.0 || p.y >= 1.0;
}

void main() {
  vec2 id = floor(gl_FragCoord.xy);
  int j = int(id.y) * uDstWidth + int(id.x);
  int i = j % uSrcCount;
  bool clone = j >= uSrcCount;
  vec2 p;
  float h;
  for (uint k = 0u; k < 16u; k++) {
    vec4 a = texelFetch(uSrc, ivec2(i % uSrcWidth, i / uSrcWidth), 0);
    p = (a.xy - uOrigin) / uSpan;
    h = a.z;
    if (!outside(p)) break;
    i = min(uSrcCount - 1, int(hash(id, 200u + k) * float(uSrcCount)));
    clone = true;
  }
  float r0 = hash(id, 101u);
  float r1 = hash(id, 102u);
  float r2 = hash(id, 103u);
  if (clone) {
    p += (vec2(r0, r1) - 0.5) * uJitter;
    h += (r2 - 0.5) * 0.8;
  }
  if (outside(p)) {
    p = vec2(r0, r1);
    h = r2 * TAU;
  }
  outAgent = vec4(p, h, 0.0);
}`;

/**
 * Draw the trail through the palette: tone-mapped so the busiest veins
 * reach the brightest color without flattening, a soft glow at each food
 * source (x, y, radius in output pixels, strength), and a little dither
 * against banding. uOffset places this draw within a larger image.
 */
export const DISPLAY_FS = HEADER + HASH_GLSL + /* glsl */ `
uniform sampler2D uTrail;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uExposure;
uniform vec4 uFood[${MAX_FOOD}];
uniform int uFoodCount;
out vec4 outColor;
${RAMP_GLSL}

void main() {
  vec2 frag = gl_FragCoord.xy + uOffset;
  float v = texture(uTrail, frag / uResolution).r;
  float x = 1.0 - exp(-max(v, 0.0) * uExposure);
  vec3 col = ramp(x);
  vec3 top = ramp(1.0);
  for (int i = 0; i < ${MAX_FOOD}; i++) {
    if (i >= uFoodCount) break;
    vec4 f = uFood[i];
    float d = length(frag - f.xy) / f.z;
    float core = 1.0 - smoothstep(0.55, 1.0, d);
    float halo = exp(-d * d * 0.35) * 0.35;
    col = mix(col, top, clamp(core + halo, 0.0, 1.0) * f.w);
  }
  col += (hash(frag, 7u) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;
