import { initTopbar } from './ui/topbar.js';
import { initReveal } from './ui/reveal.js';
import { initSettings } from './ui/settings.js';
import { initIndex } from './ui/index-overlay.js';
import { initStations } from './ui/stations-ui.js';
import { initContact } from './ui/contact.js';
import { initAsk } from './ui/ask.js';
import { initMagnetic } from './ui/magnetic.js';
import { initCopy } from './ui/copy.js';
import { whenIdle } from './ui/env.js';
import { detectTier } from './world/tiers.js';

const root = document.documentElement;

initTopbar();
initReveal();
initSettings();
initIndex();
initStations();
initContact();
initAsk();
initMagnetic();
initCopy();

// ---------- The intro (first visit per session) ----------
if (root.dataset.intro === 'play') {
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'skip-intro';
  skip.textContent = 'Skip intro';
  document.body.append(skip);
  const end = () => {
    skip.remove();
    window.removeEventListener('wheel', finish);
    window.removeEventListener('keydown', finish);
    window.removeEventListener('touchstart', finish);
  };
  const finish = () => {
    root.classList.add('intro-skipped');
    window.dispatchEvent(new CustomEvent('dimension:skip-intro'));
    window.setTimeout(() => root.classList.remove('intro-skipped'), 60);
    end();
  };
  skip.addEventListener('click', finish);
  window.addEventListener('wheel', finish, { once: true, passive: true });
  window.addEventListener('keydown', finish, { once: true });
  window.addEventListener('touchstart', finish, { once: true, passive: true });
  window.setTimeout(end, 3200);
}

// ---------- The 3D world (home only; progressive enhancement) ----------
const container = document.querySelector('[data-world]');
let world = null;
let loading = false;

async function startWorld() {
  if (!container || world || loading || root.dataset.world === 'off') return;
  const tier = detectTier();
  root.dataset.tier = String(tier);
  if (!tier) return;
  loading = true;
  try {
    const { mountWorld } = await import('./world/engine.js');
    if (root.dataset.world === 'off') return;
    const mounted = await mountWorld(container, { tier, intro: root.dataset.intro === 'play' });
    if (!mounted) {
      root.dataset.tier = '0';
    } else if (root.dataset.world === 'off') {
      // Switched off while it was being built.
      mounted.dispose();
    } else {
      world = mounted;
      root.classList.add('world-on');
    }
  } catch (error) {
    console.warn('3D world unavailable:', error);
  } finally {
    loading = false;
  }
}

function stopWorld() {
  world?.dispose();
  world = null;
  root.classList.remove('world-on');
}

if (container) {
  whenIdle(startWorld, 600);
  window.addEventListener('dimension:settings', (event) => {
    if (event.detail?.kind !== 'world') return;
    if (root.dataset.world === 'off') stopWorld();
    else startWorld();
  });
}
