import '../css/style.css';
import '../css/animations.css';
import '../css/responsive.css';

import { initNavigation } from './navigation.js';
import { initAnimations } from './animations.js';
import { initProjects } from './projects.js';
import { initContact } from './contact.js';
import { supportsWebGL, whenIdle, whenNearViewport } from './utils.js';

initNavigation();
initAnimations();
initProjects();
initContact();

document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

// 3D scenes are progressive enhancements: the CSS stand-ins stay visible
// until a scene renders its first frame, and remain if WebGL is unavailable.
if (supportsWebGL()) {
  const heroVisual = document.querySelector('[data-hero-visual]');
  if (heroVisual) {
    whenIdle(() => {
      import('./hero-3d.js')
        .then(({ mountHero }) => mountHero(heroVisual))
        .catch((error) => console.warn('Hero 3D scene unavailable:', error));
    });
  }

  const aboutVisual = document.querySelector('[data-about-visual]');
  if (aboutVisual) {
    whenNearViewport(aboutVisual, () => {
      import('./about-3d.js')
        .then(({ mountAbout }) => mountAbout(aboutVisual))
        .catch((error) => console.warn('About 3D scene unavailable:', error));
    });
  }
} else {
  document.documentElement.classList.add('no-webgl');
}
