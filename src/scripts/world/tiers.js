/**
 * Device tier for the 3D world, decided from cheap signals (no throwaway GL context).
 * 3 high-end desktop · 2 standard laptop · 1 phone/tablet/low-power · 0 no 3D (CSS still).
 * The engine checks the real GPU when it creates its renderer and steps down to 0 if it
 * finds a software rasteriser.
 */
export function detectTier() {
  if (navigator.connection?.saveData) return 0;
  if (!window.WebGL2RenderingContext) return 0;
  const memory = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const small = window.innerWidth < 768 || Math.min(window.innerWidth, window.innerHeight) < 500;
  if (touch || small) return memory < 3 ? 0 : 1;
  if (memory <= 4 || cores <= 4) return 1;
  return cores >= 8 ? 3 : 2;
}

/** GPU name check, run on the engine's own context. */
export function isSoftwareRenderer(gl) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}
