import { describe, expect, it } from 'vitest';
import { buildMailto, validateContact } from '../../src/lib/validation.js';

describe('contact validation', () => {
  it('flags every required field when empty', () => {
    expect(Object.keys(validateContact({}))).toEqual(['name', 'email', 'project_type', 'message']);
  });

  it('rejects malformed emails and short messages', () => {
    const errors = validateContact({
      name: 'Asha',
      email: 'asha@example',
      project_type: 'Landing Page',
      message: 'Hi',
    });
    expect(errors.email).toMatch(/valid email/);
    expect(errors.message).toMatch(/10 characters/);
    expect(errors.name).toBeUndefined();
  });

  it('accepts a complete enquiry', () => {
    const ok = validateContact({
      name: 'Asha Rao',
      email: 'asha@example.com',
      project_type: 'Landing Page',
      message: 'A landing page for a product launch.',
    });
    expect(ok).toEqual({});
  });

  it('builds an encoded mailto with every detail', () => {
    const url = buildMailto('me@example.com', {
      name: 'Asha',
      email: 'asha@example.com',
      project_type: 'Landing Page',
      budget: 'Flexible',
      message: 'Launch & waitlist',
    });
    expect(url.startsWith('mailto:me@example.com?subject=')).toBe(true);
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('Launch & waitlist');
    expect(body).toContain('Budget: Flexible');
    expect(body).toContain('asha@example.com');
  });
});
