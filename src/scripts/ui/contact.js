import { CONTACT_RULES, buildMailto } from '../../lib/validation.js';

const WEB3FORMS_KEY = import.meta.env.PUBLIC_WEB3FORMS_ACCESS_KEY?.trim();
const FORMSPREE_ID = import.meta.env.PUBLIC_FORMSPREE_ID?.trim();
/** 'web3forms' | 'formspree' when configured; otherwise the visitor's email app opens, pre-filled. */
export const FORM_PROVIDER = WEB3FORMS_KEY ? 'web3forms' : FORMSPREE_ID ? 'formspree' : 'mailto';
const REQUEST_TIMEOUT = 15000;

export function initContact() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const EMAIL = form.dataset.email;
  const alertBox = form.querySelector('[data-form-alert]');
  const submit = form.querySelector('[data-form-submit]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const note = form.querySelector('[data-form-note]');
  const counter = form.querySelector('[data-count]');
  const success = document.querySelector('[data-form-success]');
  const touched = new Set();
  const names = Object.keys(CONTACT_RULES);

  if (FORM_PROVIDER === 'mailto') note.textContent = 'Sending opens your email app with your message ready to go.';

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-project-type]');
    if (!link) return;
    const select = form.elements.project_type;
    if ([...select.options].some((o) => o.value === link.dataset.projectType)) select.value = link.dataset.projectType;
  });

  const value = (name) => form.elements[name].value.trim();
  const showError = (name, text) => {
    const input = form.elements[name];
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    form.querySelector(`#${input.id}-error`).textContent = text;
  };
  const validate = (name) => {
    const text = CONTACT_RULES[name](value(name));
    showError(name, text);
    return !text;
  };

  names.forEach((name) => {
    const input = form.elements[name];
    input.addEventListener('blur', () => {
      if (input.value.trim() || touched.has(name)) {
        touched.add(name);
        validate(name);
      }
    });
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => touched.has(name) && validate(name));
  });

  const message = form.elements.message;
  const updateCount = () => (counter.textContent = `${message.value.length} / ${message.maxLength}`);
  message.addEventListener('input', updateCount);
  updateCount();

  const setLoading = (loading) => {
    form.classList.toggle('is-loading', loading);
    submit.disabled = loading;
    submit.setAttribute('aria-busy', String(loading));
    submitLabel.textContent = loading ? 'Sending…' : 'Send message';
  };
  const showAlert = (html) => {
    alertBox.innerHTML = html;
    alertBox.hidden = !html;
  };
  const showSuccess = (title, text) => {
    success.querySelector('[data-success-title]').textContent = title;
    success.querySelector('[data-success-text]').textContent = text;
    form.hidden = true;
    success.hidden = false;
    success.focus();
    window.dispatchEvent(new CustomEvent('dimension:transmit'));
  };

  success.querySelector('[data-form-reset]').addEventListener('click', () => {
    form.reset();
    touched.clear();
    names.forEach((name) => showError(name, ''));
    updateCount();
    showAlert('');
    success.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showAlert('');
    names.forEach((name) => touched.add(name));
    const invalid = names.filter((name) => !validate(name));
    if (invalid.length) {
      form.elements[invalid[0]].focus();
      return;
    }
    const data = Object.fromEntries([...names, 'budget'].map((name) => [name, value(name)]));

    if (form.elements.company.value) {
      showSuccess('Message sent.', 'Thank you for reaching out.');
      return;
    }

    if (FORM_PROVIDER === 'mailto') {
      window.location.href = buildMailto(EMAIL, data);
      showSuccess(
        'Almost there.',
        `Your email app should now be open with your message ready — just press send. If nothing opened, email me directly at ${EMAIL}.`,
      );
      return;
    }

    setLoading(true);
    try {
      await send(data);
      showSuccess('Message sent.', `Thank you, ${data.name.split(' ')[0]}. I'll reply to ${data.email} soon.`);
    } catch (error) {
      console.error('Contact form error:', error);
      showAlert(
        `<strong>Your message couldn't be sent.</strong><span>Please try again, or email me directly at <a href="${buildMailto(EMAIL, data)}">${EMAIL}</a>.</span>`,
      );
    } finally {
      setLoading(false);
    }
  });
}

async function send(data) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const subject = `New project enquiry from ${data.name}`;
  const isWeb3 = FORM_PROVIDER === 'web3forms';
  const url = isWeb3 ? 'https://api.web3forms.com/submit' : `https://formspree.io/f/${FORMSPREE_ID}`;
  const payload = isWeb3
    ? { access_key: WEB3FORMS_KEY, subject, from_name: 'Siddiq Portfolio', replyto: data.email, ...data }
    : { _subject: subject, _replyto: data.email, ...data };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false || result.errors) {
      throw new Error(result.message || `Request failed with status ${response.status}`);
    }
  } finally {
    window.clearTimeout(timer);
  }
}
