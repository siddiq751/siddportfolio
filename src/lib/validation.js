// Contact-form rules, shared by the browser and the unit tests.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const CONTACT_RULES = {
  name: (v) => (!v ? 'Please enter your name.' : v.length < 2 ? 'Your name looks a little short.' : ''),
  email: (v) =>
    !v
      ? 'Please enter your email address.'
      : !EMAIL_PATTERN.test(v)
        ? 'Please enter a valid email address, like name@example.com.'
        : '',
  project_type: (v) => (!v ? 'Please choose a project type.' : ''),
  message: (v) =>
    !v
      ? 'Please tell me a little about your project.'
      : v.length < 10
        ? 'Please add a few more details (at least 10 characters).'
        : '',
};

/** Returns { field: message } for every invalid field (empty object when valid). */
export function validateContact(values) {
  const errors = {};
  for (const [field, rule] of Object.entries(CONTACT_RULES)) {
    const message = rule(String(values[field] ?? '').trim());
    if (message) errors[field] = message;
  }
  return errors;
}

export function buildMailto(email, data) {
  const subject = `Project enquiry — ${data.project_type}`;
  const body = [
    'Hi Siddiq,',
    '',
    data.message,
    '',
    `Project type: ${data.project_type}`,
    data.budget ? `Budget: ${data.budget}` : null,
    '',
    data.name,
    data.email,
  ]
    .filter((line) => line !== null)
    .join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
