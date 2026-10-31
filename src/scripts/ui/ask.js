import { splitSources } from '../../lib/ask-guard.js';

const SOURCE_LINKS = {
  profile: ['/#home', 'Core'],
  about: ['/#origin', 'About'],
  instruments: ['/#instruments', 'Skills'],
  contact: ['/#contact', 'Contact'],
};

function sourceLink(id) {
  if (SOURCE_LINKS[id]) return SOURCE_LINKS[id];
  if (id.startsWith('work:')) {
    const slug = id.slice(5);
    const card = document.querySelector(`a[href="/work/${slug}/"]`);
    const title = card?.closest('article')?.querySelector('h3')?.textContent ?? 'Case study';
    return [`/work/${slug}/`, title];
  }
  return null;
}

/** The portfolio assistant panel (only rendered when PUBLIC_ASK_ENABLED=true). */
export function initAsk() {
  const dialog = document.querySelector('[data-ask]');
  if (!dialog) return;
  const log = dialog.querySelector('[data-ask-log]');
  const intro = dialog.querySelector('[data-ask-intro]');
  const form = dialog.querySelector('[data-ask-form]');
  const input = form.elements.q;
  const send = dialog.querySelector('[data-ask-send]');
  const history = [];
  let busy = false;

  const open = () => {
    if (!dialog.open) dialog.showModal();
    input.focus();
  };
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-ask-open]')) open();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-ask-close]')) dialog.close();
    if (event.target.closest('.ask__sources a')) dialog.close();
  });
  dialog.querySelectorAll('[data-ask-suggest]').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.textContent.trim();
      form.requestSubmit();
    }),
  );

  const bubble = (role, text = '') => {
    const el = document.createElement('div');
    el.className = `ask__msg ask__msg--${role}`;
    const p = document.createElement('p');
    p.textContent = text;
    el.append(p);
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    busy = true;
    send.disabled = true;
    intro.hidden = true;
    input.value = '';
    bubble('user', question);
    history.push({ role: 'user', content: question });
    const answer = bubble('assistant', '…');
    const text = answer.querySelector('p');
    let raw = '';

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-6) }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'The assistant is unavailable right now.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        text.textContent = raw.split(/\n?\s*SOURCES:/i)[0];
        log.scrollTop = log.scrollHeight;
      }
      const { answer: clean, sources } = splitSources(raw);
      text.textContent = clean || 'Sorry — I could not answer that.';
      history.push({ role: 'assistant', content: clean });
      const links = sources.map(sourceLink).filter(Boolean);
      if (links.length) {
        const row = document.createElement('div');
        row.className = 'ask__sources';
        links.forEach(([href, label]) => {
          const a = document.createElement('a');
          a.href = href;
          a.textContent = `Take me to ${label}`;
          row.append(a);
        });
        answer.append(row);
      }
    } catch (error) {
      text.textContent = `${error.message} You can always email ${document.querySelector('[data-contact-form]')?.dataset.email ?? 'me'} directly.`;
      history.pop();
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  });
}
