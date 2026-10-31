/** "Copy" buttons for the email address, with an announced confirmation. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function initCopy() {
  document.querySelectorAll('[data-copy-email]').forEach((button) => {
    const label = button.querySelector('[data-copy-label]');
    button.addEventListener('click', async () => {
      const ok = await copyText(button.dataset.copyEmail);
      if (!label) return;
      label.textContent = ok ? 'Copied' : 'Copy failed';
      button.setAttribute('aria-live', 'polite');
      window.setTimeout(() => (label.textContent = 'Copy'), 2200);
    });
  });
}
