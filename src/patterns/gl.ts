/** Small WebGL2 helpers shared by GPU patterns. */

import { MAX_STOPS } from '../palettes';

/** Vertex shader for one triangle that covers the whole viewport. Draw with 3 vertices. */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
  uniformNames: readonly string[],
): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Shader link failed: ${log}`);
  }
  const uniforms: Program['uniforms'] = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

/** A texture you can both sample and render into. */
export interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

export interface FloatFormat {
  /** e.g. gl.RG32F or gl.RG16F */
  internalFormat: number;
  label: string;
}

/**
 * Pick the most precise two-channel float format this device can render to.
 * 32-bit floats on most desktops and many phones; 16-bit as a fallback.
 */
export function pickFloatFormat(gl: WebGL2RenderingContext): FloatFormat | null {
  const candidates: [string, number, string][] = [
    ['EXT_color_buffer_float', gl.RG32F, 'RG32F'],
    ['EXT_color_buffer_float', gl.RG16F, 'RG16F'],
    ['EXT_color_buffer_half_float', gl.RG16F, 'RG16F'],
  ];
  for (const [ext, internalFormat, label] of candidates) {
    if (!gl.getExtension(ext)) continue;
    const t = createTarget(gl, { internalFormat, label }, 4, 4);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    deleteTarget(gl, t);
    if (ok) return { internalFormat, label };
  }
  return null;
}

/** True if this device can render into a texture of this format. */
export function canRenderTo(gl: WebGL2RenderingContext, format: FloatFormat): boolean {
  const t = createTarget(gl, format, 4, 4);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  deleteTarget(gl, t);
  return ok;
}

/**
 * Render target with REPEAT wrapping (a torus). NEAREST filtering unless
 * `filter` says otherwise (LINEAR needs a filterable format).
 */
export function createTarget(
  gl: WebGL2RenderingContext,
  format: FloatFormat,
  width: number,
  height: number,
  filter: number = gl.NEAREST,
): RenderTarget {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format.internalFormat, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { texture, framebuffer, width, height };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: RenderTarget): void {
  gl.deleteFramebuffer(t.framebuffer);
  gl.deleteTexture(t.texture);
}

/** Integer hash → [0, 1). Deterministic on every GPU, unlike sin()-based noise. */
export const HASH_GLSL = /* glsl */ `
float hash(vec2 p, uint salt) {
  uvec2 q = uvec2(ivec2(floor(p)) + 65536) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y ^ (salt * 2654435761u)) * 1597334673u;
  return float(n >> 8) / 16777216.0;
}`;

/**
 * Palette ramp: uColors[0] is the background, then the palette's colors.
 * ramp(0) is the background, ramp(1) the last color. Declares its uniforms.
 */
export const RAMP_GLSL = /* glsl */ `
uniform vec3 uColors[${MAX_STOPS}];
uniform int uStops;

vec3 ramp(float x) {
  x = clamp(x, 0.0, 1.0) * float(uStops - 1);
  vec3 c = uColors[0];
  for (int i = 1; i < ${MAX_STOPS}; i++) {
    if (i >= uStops) break;
    c = mix(c, uColors[i], clamp(x - float(i - 1), 0.0, 1.0));
  }
  return c;
}`;

/** Resolves once the GPU has finished the work queued so far (checked once per frame). */
export function waitForGpu(gl: WebGL2RenderingContext): Promise<void> {
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise((resolve) => {
    const check = () => {
      if (!sync || gl.isContextLost() || gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED) {
        if (sync && !gl.isContextLost()) gl.deleteSync(sync);
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  });
}

/**
 * Draw a width × height image in tiles of at most tileSize and read it back
 * into a 2D canvas. `draw(x0, y0)` must render the tile whose bottom-left
 * corner is at (x0, y0) of the image (GL order, y up) into the bound
 * framebuffer, whose viewport is already set.
 */
export function readTiles(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  tileSize: number,
  draw: (x0: number, y0: number) => void,
  onProgress?: (fraction: number) => void,
): HTMLCanvasElement {
  const tile = createTarget(gl, { internalFormat: gl.RGBA8, label: 'RGBA8' }, tileSize, tileSize);
  try {
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d')!;
    const pixels = new Uint8Array(tileSize * tileSize * 4);
    const tiles = Math.ceil(width / tileSize) * Math.ceil(height / tileSize);
    let drawn = 0;
    for (let y0 = 0; y0 < height; y0 += tileSize) {
      for (let x0 = 0; x0 < width; x0 += tileSize) {
        const tw = Math.min(tileSize, width - x0);
        const th = Math.min(tileSize, height - y0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, tile.framebuffer);
        gl.viewport(0, 0, tw, th);
        draw(x0, y0);
        gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        // GL rows run bottom-up; images run top-down.
        const img = ctx.createImageData(tw, th);
        for (let row = 0; row < th; row++) {
          const src = (th - 1 - row) * tw * 4;
          img.data.set(pixels.subarray(src, src + tw * 4), row * tw * 4);
        }
        ctx.putImageData(img, x0, height - y0 - th);
        onProgress?.(++drawn / tiles);
      }
    }
    return out;
  } finally {
    if (!gl.isContextLost()) deleteTarget(gl, tile);
  }
}

/**
 * Whether this browser can run a GPU pattern: makes a throwaway WebGL2
 * context, runs `test` on it, and lets it go. A canvas can only ever hold
 * one kind of context, so patterns ask this before choosing between their
 * GPU and CPU versions, rather than trying WebGL2 on the real canvas first.
 */
export function probeWebGL2(test: (gl: WebGL2RenderingContext) => boolean): boolean {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = document.createElement('canvas').getContext('webgl2');
    return !!gl && !gl.isContextLost() && test(gl);
  } catch {
    return false;
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
