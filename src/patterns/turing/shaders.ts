/**
 * Shaders for the Gray-Scott simulation. State textures hold (A, B) in the
 * red and green channels, sampled with NEAREST + REPEAT so the dish wraps
 * around at the edges (and exported images tile seamlessly).
 */

import { HASH_GLSL, RAMP_GLSL } from '../gl';

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
`;

/**
 * One reaction-diffusion step. 3×3 Laplacian; diffusion rates 1.0 (A) and
 * 0.5 (B). uReaction scales the reaction terms: 1 on screen, smaller when an
 * export regrows the pattern on a finer grid (see exportGrid).
 */
export const STEP_FS = HEADER + /* glsl */ `
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec2 uFeedKill;
uniform float uReaction;
out vec4 outColor;

vec2 at(vec2 uv) { return texture(uState, uv).xy; }

void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 dx = vec2(uTexel.x, 0.0);
  vec2 dy = vec2(0.0, uTexel.y);
  vec2 c = at(uv);
  vec2 lap = -c
    + 0.2 * (at(uv + dx) + at(uv - dx) + at(uv + dy) + at(uv - dy))
    + 0.05 * (at(uv + dx + dy) + at(uv + dx - dy) + at(uv - dx + dy) + at(uv - dx - dy));
  float a = c.x;
  float b = c.y;
  float abb = a * b * b;
  float feed = uFeedKill.x;
  float kill = uFeedKill.y;
  vec2 next = c + vec2(1.0 * lap.x, 0.5 * lap.y) + uReaction * vec2(
    -abb + feed * (1.0 - a),
    abb - (feed + kill) * b
  );
  outColor = vec4(clamp(next, 0.0, 1.0), 0.0, 1.0);
}`;

const HASH = HASH_GLSL;

/** Paint a soft-edged stroke of B along the segment uSeg (in grid cells). */
export const BRUSH_FS = HEADER + HASH + /* glsl */ `
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec4 uSeg;
uniform float uRadius;
uniform uint uSalt;
out vec4 outColor;

void main() {
  vec2 c = texture(uState, gl_FragCoord.xy * uTexel).xy;
  vec2 p = gl_FragCoord.xy;
  vec2 a = uSeg.xy;
  vec2 ab = uSeg.zw - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float d = length(p - (a + ab * t));
  float m = 1.0 - smoothstep(uRadius * 0.55, uRadius, d);
  float n = hash(p, uSalt) - 0.5;
  vec2 seed = vec2(0.5, 0.25) + n * 0.04;
  outColor = vec4(mix(c, seed, m), 0.0, 1.0);
}`;

/** Bilinear sample of a NEAREST texture, returning the 4 corners for reuse. */
const BILINEAR = /* glsl */ `
struct Quad { vec2 a; vec2 b; vec2 c; vec2 d; vec2 f; };

Quad quadAt(sampler2D s, vec2 size, vec2 uv) {
  vec2 p = uv * size - 0.5;
  vec2 t = 1.0 / size;
  vec2 base = (floor(p) + 0.5) * t;
  Quad q;
  q.f = fract(p);
  q.a = texture(s, base).xy;
  q.b = texture(s, base + vec2(t.x, 0.0)).xy;
  q.c = texture(s, base + vec2(0.0, t.y)).xy;
  q.d = texture(s, base + t).xy;
  return q;
}

vec2 lerpQuad(Quad q) {
  return mix(mix(q.a, q.b, q.f.x), mix(q.c, q.d, q.f.x), q.f.y);
}`;

/**
 * Copy (part of) one state texture into another of a different size,
 * smoothly. Destination cell centers sample the source at
 * uOrigin + gl_FragCoord.xy * uStride, in source cells.
 */
export const RESAMPLE_FS = HEADER + BILINEAR + /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uSrcSize;
uniform vec2 uOrigin;
uniform vec2 uStride;
out vec4 outColor;

void main() {
  vec2 uv = (uOrigin + gl_FragCoord.xy * uStride) / uSrcSize;
  outColor = vec4(lerpQuad(quadAt(uSrc, uSrcSize, uv)), 0.0, 1.0);
}`;

/**
 * Draw B through the palette ramp (background, then 3–5 colors), with a soft
 * emboss so the pattern reads as a surface rather than a flat map, plus a
 * little dither against banding.
 *
 * uOffset places this draw within a larger image (exports render in tiles);
 * uEmboss is the light strength per cell, raised on finer export grids so
 * the shading matches the screen.
 */
export const DISPLAY_FS = HEADER + HASH + BILINEAR + /* glsl */ `
uniform sampler2D uState;
uniform vec2 uSize;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uEmboss;
out vec4 outColor;
${RAMP_GLSL}

void main() {
  vec2 frag = gl_FragCoord.xy + uOffset;
  Quad q = quadAt(uState, uSize, frag / uResolution);
  float v = mix(mix(q.a.y, q.b.y, q.f.x), mix(q.c.y, q.d.y, q.f.x), q.f.y);
  // Gradient of B per cell, from the same four samples.
  vec2 g = vec2(mix(q.b.y - q.a.y, q.d.y - q.c.y, q.f.y),
                mix(q.c.y - q.a.y, q.d.y - q.b.y, q.f.x));
  float x = smoothstep(0.1, 0.3, v);
  vec3 col = ramp(x);
  // Light from the top-left.
  float light = dot(g, vec2(-0.7071, 0.7071)) * uEmboss;
  col += clamp(light, -0.12, 0.12) * (0.4 + 0.6 * x);
  col += (hash(frag, 7u) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;
