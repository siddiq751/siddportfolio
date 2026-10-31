import { clamp, finePointerQuery, prefersReducedMotion, reducedMotionQuery } from './utils.js';

export function initAnimations() {
  initReveals();
  initScrollEffects();
  initMagnetic();
  initProjectTilt();
}

/** Fade/slide elements in once as they enter the viewport. */
function initReveals() {
  const targets = [...document.querySelectorAll('[data-reveal], [data-timeline]')];
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
  );
  targets.forEach((el) => observer.observe(el));
}

/**
 * Scroll-linked touches, batched into one rAF:
 * the hero copy drifts up slightly as it leaves, and [data-parallax] elements
 * move at a fraction of the scroll speed.
 */
function initScrollEffects() {
  const hero = document.querySelector('[data-hero]');
  const heroGrid = hero?.querySelector('.hero__grid');
  const parallax = [...document.querySelectorAll('[data-parallax]')];
  let ticking = false;

  const update = () => {
    ticking = false;
    if (prefersReducedMotion()) return;

    if (hero && heroGrid) {
      const progress = clamp(window.scrollY / hero.offsetHeight, 0, 1);
      heroGrid.style.setProperty('--hero-shift', `${(progress * -48).toFixed(1)}px`);
    }

    const viewportCenter = window.innerHeight / 2;
    parallax.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;
      const speed = Number(el.dataset.parallax) || 0;
      const offset = (rect.top + rect.height / 2 - viewportCenter) * speed;
      el.style.translate = `0 ${offset.toFixed(1)}px`;
    });
  };

  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  reducedMotionQuery.addEventListener('change', () => {
    heroGrid?.style.removeProperty('--hero-shift');
    parallax.forEach((el) => (el.style.translate = ''));
    request();
  });
  update();
}

/** Buttons lean gently toward the cursor (mouse only, never with reduced motion). */
function initMagnetic() {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const strength = 0.22;
    const max = 8;

    el.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || !finePointerQuery.matches || prefersReducedMotion()) return;
      const rect = el.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left - rect.width / 2) * strength, -max, max);
      const y = clamp((event.clientY - rect.top - rect.height / 2) * strength * 1.4, -max, max);
      el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    });

    el.addEventListener('pointerleave', () => {
      el.style.translate = '';
    });
  });
}

/** Project previews tilt a few degrees toward the cursor. */
function initProjectTilt() {
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    const target = card.querySelector('[data-tilt-target]');
    if (!target) return;
    let frame = 0;

    card.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || !finePointerQuery.matches || prefersReducedMotion()) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        target.style.setProperty('--ry', `${(px * 5).toFixed(2)}deg`);
        target.style.setProperty('--rx', `${(py * -3.5).toFixed(2)}deg`);
      });
    });

    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      target.style.removeProperty('--rx');
      target.style.removeProperty('--ry');
    });
  });
}
