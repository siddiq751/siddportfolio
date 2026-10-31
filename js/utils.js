export const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

export const prefersReducedMotion = () => reducedMotionQuery.matches;

/** three.js r163+ requires WebGL 2. */
export function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/** Run once the main thread is idle, so heavy work never delays first paint. */
export function whenIdle(callback, timeout = 900) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout });
  } else {
    window.setTimeout(callback, 200);
  }
}

/** Run once, shortly before an element scrolls into view. */
export function whenNearViewport(element, callback, rootMargin = '400px 0px') {
  if (!('IntersectionObserver' in window)) {
    callback();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    },
    { rootMargin },
  );
  observer.observe(element);
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
