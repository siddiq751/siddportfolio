/**
 * Site-wide contact details and form delivery settings.
 * Provider keys come from environment variables (see .env.example / README).
 */
export const CONTACT_EMAIL = 'siddiqmd751@gmail.com';
export const WHATSAPP_URL = 'https://wa.me/917416715011';

const web3formsKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY?.trim();
const formspreeId = import.meta.env.VITE_FORMSPREE_ID?.trim();

/**
 * 'web3forms' | 'formspree' when configured, otherwise 'mailto':
 * the form then opens the visitor's email app with the message pre-filled.
 */
export const FORM_PROVIDER = web3formsKey ? 'web3forms' : formspreeId ? 'formspree' : 'mailto';

export const FORM_ENDPOINTS = {
  web3forms: { url: 'https://api.web3forms.com/submit', accessKey: web3formsKey },
  formspree: { url: formspreeId ? `https://formspree.io/f/${formspreeId}` : '' },
};
