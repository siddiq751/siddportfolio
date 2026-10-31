import { clamp, isReduced, onScroll } from './env.js';

/**
 * Orientation + station UI: the rail and pill show where you are; the Works gallery
 * steps through studies; skills and filters broadcast to the 3D world.
 */
export function initStations() {
  const sections = [...document.querySelectorAll('[data-station]')];
  if (!sections.length) return;
  const links = [...document.querySelectorAll('[data-station-link]')];
  const pill = document.querySelector('[data-pill]');
  const pillIndex = pill?.querySelector('[data-pill-index]');
  const pillLabel = pill?.querySelector('[data-pill-label]');
  const labels = Object.fromEntries(
    links.map((a) => [a.dataset.stationLink, a.querySelector('.rail__name')?.textContent.trim() ?? '']),
  );
  let current = null;

  onScroll(() => {
    const probe = window.innerHeight * 0.4;
    let active = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= probe) active = s;
    const id = active.dataset.station;

    // Per-station progress for the rail ticks.
    for (const a of links) {
      const section = document.getElementById(a.dataset.stationLink);
      if (!section) continue;
      const r = section.getBoundingClientRect();
      const p = clamp((probe - r.top) / Math.max(r.height, 1), 0, 1);
      a.querySelector('.rail__tick')?.style.setProperty('--p', p.toFixed(3));
    }

    if (id !== current) {
      current = id;
      links.forEach((a) => a.setAttribute('aria-current', String(a.dataset.stationLink === id)));
      if (pill) {
        const [num, ...name] = (labels[id] || '').split(' ');
        pillIndex.textContent = num;
        pillLabel.textContent = name.join(' ');
      }
    }
    if (pill) {
      const doc = document.documentElement;
      const total = clamp(window.scrollY / Math.max(doc.scrollHeight - window.innerHeight, 1), 0, 1);
      pill.style.setProperty('--p', total.toFixed(3));
      pill.classList.toggle('is-hidden', window.scrollY < window.innerHeight * 0.6);
    }
  });

  initWorksGallery();
  initSkills();
  prefillProjectType();
}

function initWorksGallery() {
  const section = document.querySelector('#works');
  if (!section) return;
  const cards = [...section.querySelectorAll('[data-work]')];
  const steps = [...section.querySelectorAll('[data-work-step]')];
  const gallery = window.matchMedia('(min-width: 1024px)');
  let index = 0;

  const progressFor = (i) => (cards.length > 1 ? i / (cards.length - 1) : 0);
  const scrollToIndex = (i) => {
    const top = section.getBoundingClientRect().top + window.scrollY;
    const range = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + range * progressFor(i) + 1, behavior: isReduced() ? 'auto' : 'smooth' });
  };

  const setIndex = (i) => {
    index = i;
    cards.forEach((card, n) => {
      const on = n === i || !gallery.matches;
      card.classList.toggle('is-active', n === i);
      card.inert = !on;
    });
    steps.forEach((s, n) => s.setAttribute('aria-current', String(n === i)));
    window.dispatchEvent(new CustomEvent('dimension:work', { detail: { index: i } }));
  };

  onScroll(() => {
    if (!gallery.matches) {
      if (cards.some((c) => c.inert)) cards.forEach((c) => (c.inert = false));
      return;
    }
    const rect = section.getBoundingClientRect();
    const range = section.offsetHeight - window.innerHeight;
    const p = clamp(-rect.top / Math.max(range, 1), 0, 1);
    const i = Math.round(p * (cards.length - 1));
    if (i !== index || cards.some((c, n) => c.inert === (n === i))) setIndex(i);
  });

  steps.forEach((s) => s.addEventListener('click', () => scrollToIndex(Number(s.dataset.workStep))));
  section.addEventListener('keydown', (event) => {
    if (!gallery.matches || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    if (event.target.closest('input, textarea, select')) return;
    event.preventDefault();
    const next = clamp(index + (event.key === 'ArrowRight' ? 1 : -1), 0, cards.length - 1);
    scrollToIndex(next);
    window.setTimeout(() => cards[next].querySelector('a')?.focus({ preventScroll: true }), isReduced() ? 0 : 700);
  });

  // Opening a case study: let the world fly into the screen first (when it's running).
  section.addEventListener('click', (event) => {
    const link = event.target.closest('[data-work-open]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (!document.documentElement.classList.contains('world-on') || !gallery.matches || isReduced()) return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('dimension:open-work', { detail: { index: Number(link.dataset.workOpen) } }));
    window.setTimeout(() => (window.location.href = link.href), 650);
  });
}

function initSkills() {
  const section = document.querySelector('#instruments');
  if (!section) return;
  const emit = (detail) => window.dispatchEvent(new CustomEvent('dimension:skill', { detail }));

  section.querySelectorAll('[data-skill]').forEach((button) => {
    const [group, item] = button.dataset.skill.split(':').map(Number);
    const on = () => {
      section.querySelectorAll('.skill.is-active').forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');
      emit({ group, item });
    };
    const off = () => {
      button.classList.remove('is-active');
      emit({ group: null, item: null });
    };
    button.addEventListener('pointerenter', on);
    button.addEventListener('focus', on);
    button.addEventListener('click', on);
    button.addEventListener('pointerleave', off);
    button.addEventListener('blur', off);
  });

  const filters = [...section.querySelectorAll('[data-skill-filter]')];
  const groups = [...section.querySelectorAll('[data-skill-group]')];
  filters.forEach((chip) =>
    chip.addEventListener('click', () => {
      const id = chip.dataset.skillFilter;
      filters.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      groups.forEach((g) => g.classList.toggle('is-dimmed', id !== 'all' && g.dataset.skillGroup !== id));
      window.dispatchEvent(
        new CustomEvent('dimension:filter', {
          detail: { group: id === 'all' ? null : groups.findIndex((g) => g.dataset.skillGroup === id) },
        }),
      );
    }),
  );
}

/** "Start a similar project" links arrive with ?type=…#contact. */
function prefillProjectType() {
  const type = new URLSearchParams(window.location.search).get('type');
  if (!type) return;
  const select = document.querySelector('#f-type');
  if (select && [...select.options].some((o) => o.value === type)) select.value = type;
}
