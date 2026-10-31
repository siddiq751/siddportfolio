import { CONTACT_EMAIL, FORM_ENDPOINTS, FORM_PROVIDER } from './config.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REQUEST_TIMEOUT = 15000;

const RULES = {
  name: (v) => (!v ? 'Please enter your name.' : v.length < 2 ? 'Your name looks a little short.' : ''),
  email: (v) => (!v ? 'Please enter your email address.' : !EMAIL_PATTERN.test(v) ? 'Please enter a valid email address, like name@example.com.' : ''),
  project_type: (v) => (!v ? 'Please choose a project type.' : ''),
  message: (v) =>
    !v ? 'Please tell me a little about your project.' : v.length < 10 ? 'Please add a few more details (at least 10 characters).' : '',
};

/** Pre-selects a project type in the form (used by service cards and case studies). */
export function selectProjectType(type) {
  const select = document.querySelector('#f-type');
  if (!select || !type) return;
  const option = [...select.options].find((o) => o.value === type);
  if (!option) return;
  select.value = type;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

export function initContact() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  const alertBox = form.querySelector('[data-form-alert]');
  const submit = form.querySelector('[data-form-submit]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const note = form.querySelector('[data-form-note]');
  const counter = form.querySelector('[data-count]');
  const message = form.elements.message;
  const success = document.querySelector('[data-form-success]');
  const successTitle = success?.querySelector('[data-success-title]');
  const successText = success?.querySelector('[data-success-text]');
  const resetButton = success?.querySelector('[data-form-reset]');
  const touched = new Set();

  if (FORM_PROVIDER === 'mailto') {
    note.textContent = 'Sending opens your email app with your message ready to go.';
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-project-type]:not([data-case-contact])');
    if (link) selectProjectType(link.dataset.projectType);
  });

  // ----- Validation -----
  const fieldValue = (name) => form.elements[name].value.trim();

  const showError = (name, text) => {
    const input = form.elements[name];
    const error = form.querySelector(`#${input.id}-error`);
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (error) error.textContent = text;
  };

  const validateField = (name) => {
    const text = RULES[name](fieldValue(name));
    showError(name, text);
    return !text;
  };

  Object.keys(RULES).forEach((name) => {
    const input = form.elements[name];
    input.addEventListener('blur', () => {
      if (input.value.trim() || touched.has(name)) {
        touched.add(name);
        validateField(name);
      }
    });
    // Once a field has shown an error, re-check it live so the error clears as soon as it's fixed.
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (touched.has(name)) validateField(name);
    });
  });

  const updateCount = () => {
    counter.textContent = `${message.value.length} / ${message.maxLength}`;
  };
  message.addEventListener('input', updateCount);
  updateCount();

  // ----- States -----
  const setLoading = (loading) => {
    form.classList.toggle('is-loading', loading);
    submit.disabled = loading;
    submit.setAttribute('aria-busy', String(loading));
    submitLabel.textContent = loading ? 'Sending…' : 'Send Message';
  };

  const showAlert = (html) => {
    alertBox.innerHTML = html;
    alertBox.hidden = !html;
  };

  const showSuccess = (title, text) => {
    successTitle.textContent = title;
    successText.textContent = text;
    form.hidden = true;
    success.hidden = false;
    success.focus();
  };

  resetButton?.addEventListener('click', () => {
    form.reset();
    touched.clear();
    Object.keys(RULES).forEach((name) => showError(name, ''));
    updateCount();
    showAlert('');
    success.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });

  // ----- Submit -----
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showAlert('');

    const names = Object.keys(RULES);
    names.forEach((name) => touched.add(name));
    const invalid = names.filter((name) => !validateField(name));
    if (invalid.length) {
      form.elements[invalid[0]].focus();
      return;
    }

    const data = {
      name: fieldValue('name'),
      email: fieldValue('email'),
      project_type: fieldValue('project_type'),
      budget: fieldValue('budget'),
      message: fieldValue('message'),
    };

    // Bots fill the hidden field; quietly pretend success without sending.
    if (form.elements.company.value) {
      showSuccess('Message sent.', 'Thank you for reaching out.');
      return;
    }

    if (FORM_PROVIDER === 'mailto') {
      window.location.href = buildMailto(data);
      showSuccess(
        'Almost there.',
        `Your email app should now be open with your message ready — just press send. If nothing opened, email me directly at ${CONTACT_EMAIL}.`,
      );
      return;
    }

    setLoading(true);
    try {
      await sendToProvider(data);
      showSuccess('Message sent.', `Thank you, ${data.name.split(' ')[0]}. I've received your message and will reply to ${data.email} soon.`);
    } catch (error) {
      console.error('Contact form error:', error);
      showAlert(
        `<strong>Your message couldn't be sent.</strong><span>Please check your connection and try again, or email me directly at <a href="${buildMailto(data)}">${CONTACT_EMAIL}</a>.</span>`,
      );
    } finally {
      setLoading(false);
    }
  });
}

function buildMailto(data) {
  const subject = `Project enquiry — ${data.project_type}`;
  const body = [
    `Hi Siddiq,`,
    ``,
    data.message,
    ``,
    `Project type: ${data.project_type}`,
    data.budget ? `Budget: ${data.budget}` : null,
    ``,
    `${data.name}`,
    data.email,
  ]
    .filter((line) => line !== null)
    .join('\n');
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function sendToProvider(data) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const subject = `New project enquiry from ${data.name}`;

  const payload =
    FORM_PROVIDER === 'web3forms'
      ? {
          access_key: FORM_ENDPOINTS.web3forms.accessKey,
          subject,
          from_name: 'Siddiq Portfolio',
          replyto: data.email,
          ...data,
        }
      : { _subject: subject, _replyto: data.email, ...data };

  const url = FORM_ENDPOINTS[FORM_PROVIDER].url;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    // Web3Forms reports { success }, Formspree reports { ok } / errors.
    const ok = response.ok && result.success !== false && !result.errors;
    if (!ok) throw new Error(result.message || `Request failed with status ${response.status}`);
    return result;
  } finally {
    window.clearTimeout(timer);
  }
}
