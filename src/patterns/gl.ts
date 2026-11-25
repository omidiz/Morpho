/** Small WebGL2 helpers shared by GPU patterns. */

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

/** Float render target with NEAREST filtering and REPEAT wrapping (a torus). */
export function createTarget(
  gl: WebGL2RenderingContext,
  format: FloatFormat,
  width: number,
  height: number,
): RenderTarget {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format.internalFormat, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
