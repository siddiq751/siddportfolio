import { prefersReducedMotion } from './utils.js';
import { selectProjectType } from './contact.js';

/**
 * Case studies open in a native <dialog> (focus trapping, Esc and focus
 * restoration come for free). Content comes from <template id="case-…">,
 * and the desktop preview reuses the live mock from the project card.
 */
export function initProjects() {
  const dialog = document.querySelector('[data-case-dialog]');
  const content = dialog?.querySelector('[data-case-content]');
  const panel = dialog?.querySelector('.case__panel');
  if (!dialog || !content || typeof dialog.showModal !== 'function') return;

  let closing = false;

  const open = (id) => {
    const template = document.getElementById(`case-${id}`);
    if (!template) return;

    const fragment = template.content.cloneNode(true);
    fragment.querySelectorAll('[data-mock-slot]').forEach((slot) => {
      const mock = document.querySelector(`[data-mock="${slot.dataset.mockSlot}"]`);
      if (mock) slot.append(mock.cloneNode(true));
    });

    content.replaceChildren(fragment);
    dialog.showModal();
    panel.scrollTop = 0;
    document.documentElement.classList.add('is-locked');
  };

  const close = () =>
    new Promise((resolve) => {
      if (!dialog.open || closing) return resolve();
      closing = true;

      const finish = () => {
        dialog.classList.remove('is-closing');
        dialog.close();
        closing = false;
        resolve();
      };

      if (prefersReducedMotion()) return finish();
      dialog.classList.add('is-closing');
      dialog.addEventListener('animationend', finish, { once: true });
      window.setTimeout(() => closing && finish(), 400); // safety net
    });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-case-open]');
    if (trigger) open(trigger.dataset.caseOpen);
  });

  dialog.addEventListener('click', (event) => {
    // Clicks on the backdrop land on the <dialog> element itself.
    if (event.target === dialog || event.target.closest('[data-case-close]')) close();
  });

  // Animate Esc-closes too, instead of the instant default.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('is-locked');
    content.replaceChildren();
  });

  // "Start a similar project" — close, pre-select the type, then go to the form.
  content.addEventListener('click', async (event) => {
    const link = event.target.closest('[data-case-contact]');
    if (!link) return;
    event.preventDefault();
    const type = link.dataset.projectType;
    await close();
    selectProjectType(type);
    const contact = document.querySelector('#contact');
    contact?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', '#contact');
    document.querySelector('#f-name')?.focus({ preventScroll: true });
  });
}
