import { onScroll } from './env.js';

export function initTopbar() {
  const bar = document.querySelector('[data-topbar]');
  if (!bar) return;
  onScroll(() => bar.classList.toggle('is-scrolled', window.scrollY > 8));
}
