import { copyText } from './copy.js';

/** The Index: full-screen navigation + command palette (⌘K / Ctrl+K). */
export function initIndex() {
  const dialog = document.querySelector('[data-index]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const input = dialog.querySelector('[data-index-input]');
  const items = [...dialog.querySelectorAll('[data-index-results] > li')];
  const empty = dialog.querySelector('[data-index-empty]');
  const status = dialog.querySelector('[data-index-status]');
  let active = 0;

  const visible = () => items.filter((li) => !li.hidden);

  const setActive = (index) => {
    const list = visible();
    if (!list.length) return;
    active = (index + list.length) % list.length;
    items.forEach((li) => li.setAttribute('aria-selected', 'false'));
    items.forEach((li) => (li.dataset.active = 'false'));
    const current = list[active];
    current.setAttribute('aria-selected', 'true');
    current.dataset.active = 'true';
    input.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({ block: 'nearest' });
  };

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    items.forEach((li) => (li.hidden = q !== '' && !q.split(/\s+/).every((word) => li.dataset.keys.includes(word))));
    const count = visible().length;
    empty.hidden = count > 0;
    status.textContent = q ? `${count} result${count === 1 ? '' : 's'}` : '';
    setActive(0);
  };

  const open = () => {
    if (dialog.open) return;
    input.value = '';
    filter();
    dialog.showModal();
    document.documentElement.classList.add('is-locked');
    input.focus();
    window.dispatchEvent(new CustomEvent('dimension:overlay', { detail: { open: true } }));
  };

  const close = () => {
    if (!dialog.open) return;
    dialog.close();
  };

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('is-locked');
    window.dispatchEvent(new CustomEvent('dimension:overlay', { detail: { open: false } }));
  });

  const activate = (li) => {
    const target = li?.querySelector('a, button');
    if (!target) return;
    target.click();
  };

  dialog.addEventListener('click', async (event) => {
    if (event.target.closest('[data-index-close]')) return close();
    const action = event.target.closest('[data-index-action]');
    if (action) {
      if (action.dataset.indexAction === 'copy-email') {
        const email = dialog.querySelector('a[href^="mailto:"]')?.getAttribute('href').replace('mailto:', '');
        const ok = await copyText(email);
        status.textContent = ok ? 'Email address copied.' : 'Copy failed — the address is listed under Direct.';
        return;
      }
      if (action.dataset.indexAction === 'ask') {
        close();
        document.querySelector('[data-ask-open]')?.click();
        return;
      }
    }
    // Links close the overlay so the page unlocks before navigating.
    if (event.target.closest('[data-index-results] a, .index__contact a')) close();
  });

  input.addEventListener('input', filter);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(visible()[active]);
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-index-open]')) open();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) close();
      else open();
    }
  });
}
