import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const headers = JSON.parse(read('vercel.json')).headers.flatMap((rule) => rule.headers);
const csp = headers.find((h) => h.key === 'Content-Security-Policy').value;

describe('Content-Security-Policy', () => {
  it('allows the inlined boot script by its exact SHA-256 hash', () => {
    // public/boot.js is inlined into every page (src/layouts/Base.astro). Edit it → update vercel.json.
    const hash = createHash('sha256').update(read('public/boot.js'), 'utf8').digest('base64');
    expect(csp).toContain(`'sha256-${hash}'`);
  });

  it('never allows arbitrary inline or eval scripts', () => {
    const scriptSrc = csp.match(/script-src([^;]*)/)[1];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('only connects to self and the form providers', () => {
    expect(csp.match(/connect-src([^;]*)/)[1].trim()).toBe("'self' https://api.web3forms.com https://formspree.io");
  });
});
