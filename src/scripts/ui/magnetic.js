import { clamp, finePointer, isReduced } from './env.js';

/** Primary CTAs lean slightly toward the cursor (mouse only, never with reduced motion). */
export function initMagnetic() {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || !finePointer.matches || isReduced()) return;
      const rect = el.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left - rect.width / 2) * 0.2, -7, 7);
      const y = clamp((event.clientY - rect.top - rect.height / 2) * 0.3, -6, 6);
      el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    });
    el.addEventListener('pointerleave', () => (el.style.translate = ''));
  });
}
