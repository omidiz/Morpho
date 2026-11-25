/**
 * Shaders for the Gray-Scott simulation. State textures hold (A, B) in the
 * red and green channels, sampled with NEAREST + REPEAT so the dish wraps
 * around at the edges (and exported images tile seamlessly).
 */

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
`;

/** One reaction-diffusion step. 3×3 Laplacian; diffusion rates 1.0 (A) and 0.5 (B). */
export const STEP_FS = HEADER + /* glsl */ `
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec2 uFeedKill;
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
  vec2 next = c + vec2(
    1.0 * lap.x - abb + feed * (1.0 - a),
    0.5 * lap.y + abb - (feed + kill) * b
  );
  outColor = vec4(clamp(next, 0.0, 1.0), 0.0, 1.0);
}`;

/** Integer hash → [0, 1). Deterministic on every GPU, unlike sin()-based noise. */
const HASH = /* glsl */ `
float hash(vec2 p, uint salt) {
  uvec2 q = uvec2(ivec2(floor(p)) + 65536) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y ^ (salt * 2654435761u)) * 1597334673u;
  return float(n >> 8) / 16777216.0;
}`;

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

/** Copy one state texture into another of a different size, smoothly. */
export const RESAMPLE_FS = HEADER + BILINEAR + /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uSrcSize;
uniform vec2 uDstTexel;
out vec4 outColor;

void main() {
  outColor = vec4(lerpQuad(quadAt(uSrc, uSrcSize, gl_FragCoord.xy * uDstTexel)), 0.0, 1.0);
}`;

/**
 * Draw B through a 4-color palette ramp, with a soft emboss so the pattern
 * reads as a surface rather than a flat map, plus a little dither against
 * banding.
 */
export const DISPLAY_FS = HEADER + HASH + BILINEAR + /* glsl */ `
uniform sampler2D uState;
uniform vec2 uSize;
uniform vec2 uResolution;
uniform vec3 uColors[4];
out vec4 outColor;

vec3 ramp(float x) {
  x = clamp(x, 0.0, 1.0) * 3.0;
  vec3 c = mix(uColors[0], uColors[1], clamp(x, 0.0, 1.0));
  c = mix(c, uColors[2], clamp(x - 1.0, 0.0, 1.0));
  return mix(c, uColors[3], clamp(x - 2.0, 0.0, 1.0));
}

void main() {
  Quad q = quadAt(uState, uSize, gl_FragCoord.xy / uResolution);
  float v = mix(mix(q.a.y, q.b.y, q.f.x), mix(q.c.y, q.d.y, q.f.x), q.f.y);
  // Gradient of B per cell, from the same four samples.
  vec2 g = vec2(mix(q.b.y - q.a.y, q.d.y - q.c.y, q.f.y),
                mix(q.c.y - q.a.y, q.d.y - q.b.y, q.f.x));
  float x = smoothstep(0.1, 0.3, v);
  vec3 col = ramp(x);
  // Light from the top-left.
  float light = dot(g, vec2(-0.7071, 0.7071)) * 2.2;
  col += clamp(light, -0.12, 0.12) * (0.4 + 0.6 * x);
  col += (hash(gl_FragCoord.xy, 7u) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;
