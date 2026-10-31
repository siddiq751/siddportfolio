const DESKTOP_QUERY = window.matchMedia('(min-width: 900px)');

export function initNavigation() {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;

  const setActive = initActiveIndicator(nav);
  initScrollSpy(nav, setActive);
  initMobileMenu();
}

/**
 * One rAF-batched scroll pass: frosted background once scrolled, dark styling
 * while the bar sits over a dark section, and the active section — the last
 * one whose top has passed ~38% of the viewport (so the footer keeps "Contact").
 */
function initScrollSpy(nav, setActive) {
  const sections = [...document.querySelectorAll('[data-section]')];
  const darkSections = [...document.querySelectorAll('.theme-dark')];
  let ticking = false;

  const update = () => {
    ticking = false;
    nav.classList.toggle('is-scrolled', window.scrollY > 8);

    const navMiddle = nav.offsetHeight / 2;
    nav.classList.toggle(
      'is-dark',
      darkSections.some((section) => {
        const rect = section.getBoundingClientRect();
        return rect.top <= navMiddle && rect.bottom >= navMiddle;
      }),
    );

    const probe = window.innerHeight * 0.38;
    let active = sections[0];
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= probe) active = section;
    });
    if (active) setActive(active.dataset.section);
  };

  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  update();
}

/** Slides the pill behind the active desktop link; marks links with aria-current. */
function initActiveIndicator(nav) {
  const indicator = nav.querySelector('[data-nav-indicator]');
  const desktopLinks = [...nav.querySelectorAll('[data-nav-links] a')];
  const allLinks = [...document.querySelectorAll('[data-nav-link]')];
  let current = null;

  const place = () => {
    const link = desktopLinks.find((a) => a.dataset.navLink === current);
    if (!indicator || !link || !DESKTOP_QUERY.matches) return;
    indicator.style.setProperty('--x', `${link.offsetLeft + 4}px`);
    indicator.style.setProperty('--w', `${link.offsetWidth}px`);
    indicator.classList.add('is-ready');
  };

  window.addEventListener('resize', place);
  DESKTOP_QUERY.addEventListener('change', place);
  document.fonts?.ready.then(place);

  return (id) => {
    if (!id || id === current) return;
    current = id;
    allLinks.forEach((a) => {
      if (a.dataset.navLink === id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    place();
  };
}

function initMobileMenu() {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (!toggle || !menu) return;

  const inertTargets = [document.querySelector('main'), document.querySelector('footer')].filter(Boolean);
  let open = false;
  let hideTimer;

  const setOpen = (next, { restoreFocus = true } = {}) => {
    if (next === open) return;
    open = next;
    window.clearTimeout(hideTimer);

    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.documentElement.classList.toggle('is-locked', open);
    document.body.classList.toggle('menu-open', open);
    inertTargets.forEach((el) => (el.inert = open));

    if (open) {
      menu.hidden = false;
      // Next frame, so the opacity transition runs from the hidden state.
      requestAnimationFrame(() => {
        menu.classList.add('is-open');
        menu.querySelector('a')?.focus({ preventScroll: true });
      });
    } else {
      menu.classList.remove('is-open');
      hideTimer = window.setTimeout(() => (menu.hidden = true), 400);
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }
  };

  toggle.addEventListener('click', () => setOpen(!open));

  // Links close the menu first so the page is unlocked before the jump.
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false, { restoreFocus: false });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) setOpen(false);
  });

  DESKTOP_QUERY.addEventListener('change', (event) => {
    if (event.matches) setOpen(false, { restoreFocus: false });
  });
}
