// Experience settings: Reduce motion · 3D world · Immersive (fullscreen). Stored per device.
const root = document.documentElement;
const KEYS = { motion: 'dimension:motion', world: 'dimension:world' };

const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the setting still applies for this page view */
  }
};

export function initSettings() {
  const switches = document.querySelectorAll('[data-setting]');
  const osReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const sync = () => {
    switches.forEach((el) => {
      const kind = el.dataset.setting;
      let on = false;
      if (kind === 'motion') on = root.dataset.motion === 'reduced' || osReduce.matches;
      if (kind === 'world') on = root.dataset.world !== 'off';
      if (kind === 'fullscreen') on = Boolean(document.fullscreenElement);
      el.setAttribute('aria-checked', String(on));
      if (kind === 'motion' && osReduce.matches) {
        el.disabled = true;
        el.title = 'Reduced motion is on in your system settings';
      }
    });
  };

  switches.forEach((el) => {
    el.addEventListener('click', async () => {
      const kind = el.dataset.setting;
      if (kind === 'motion') {
        const reduced = root.dataset.motion !== 'reduced';
        if (reduced) root.dataset.motion = 'reduced';
        else delete root.dataset.motion;
        write(KEYS.motion, reduced ? 'reduced' : null);
      }
      if (kind === 'world') {
        const off = root.dataset.world !== 'off';
        if (off) root.dataset.world = 'off';
        else delete root.dataset.world;
        write(KEYS.world, off ? 'off' : null);
      }
      if (kind === 'fullscreen') {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        } catch {
          /* fullscreen refused (e.g. iframe or browser policy) */
        }
      }
      sync();
      window.dispatchEvent(new CustomEvent('dimension:settings', { detail: { kind } }));
    });
  });

  const fullRow = document.querySelector('[data-fullscreen-row]');
  if (fullRow && document.fullscreenEnabled && window.matchMedia('(pointer: fine)').matches) fullRow.hidden = false;
  document.addEventListener('fullscreenchange', sync);
  osReduce.addEventListener('change', sync);
  sync();
}
