// Shared environment helpers for the UI layer.
const root = document.documentElement;
const osReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

export const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

/** Motion is reduced by the OS setting or the in-site toggle. */
export const isReduced = () => osReduce.matches || root.dataset.motion === 'reduced';

export function onMotionChange(callback) {
  osReduce.addEventListener('change', callback);
  window.addEventListener('dimension:settings', callback);
}

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

export function whenIdle(callback, timeout = 1200) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout });
  else window.setTimeout(callback, 250);
}

/** One rAF-batched scroll/resize stream shared by every module. */
const scrollListeners = new Set();
let ticking = false;
const flush = () => {
  ticking = false;
  scrollListeners.forEach((fn) => fn());
};
const request = () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(flush);
  }
};
window.addEventListener('scroll', request, { passive: true });
window.addEventListener('resize', request);

export function onScroll(fn) {
  scrollListeners.add(fn);
  fn();
  return () => scrollListeners.delete(fn);
}
