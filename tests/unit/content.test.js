import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import site from '../../src/content/site.json' with { type: 'json' };
import { EMAIL_PATTERN } from '../../src/lib/validation.js';
import { getStations } from '../../src/lib/stations.js';

describe('site content', () => {
  it('has valid contact details', () => {
    expect(site.contact.email).toMatch(EMAIL_PATTERN);
    expect(site.contact.whatsapp.url).toBe('https://wa.me/917416715011');
  });

  it('lists skills without ratings', () => {
    expect(site.skills.length).toBeGreaterThan(0);
    for (const group of site.skills) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) expect(typeof item).toBe('string');
    }
  });

  it('offers a project type in the form for every service', () => {
    for (const service of site.services) expect(service.type).toBeTruthy();
  });

  it('every station in the rail has a section on the page', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync(new URL('../../src/pages/index.astro', import.meta.url), 'utf8');
    const components = {
      home: 'Hero',
      origin: 'Origin',
      instruments: 'Instruments',
      works: 'Works',
      contact: 'Contact',
    };
    for (const { id } of getStations(site)) {
      expect(components[id], `no component mapped for station "${id}"`).toBeTruthy();
      expect(page).toContain(`<${components[id]}`);
    }
  });
});

describe('projects', () => {
  const dir = new URL('../../src/content/projects/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));

  it('labels every concept as a study with a fictional-brand note', () => {
    for (const file of files) {
      const text = readFileSync(new URL(file, dir), 'utf8');
      const kind = text.match(/^kind:\s*(\w+)/m)?.[1];
      expect(['project', 'study']).toContain(kind);
      if (kind === 'study') expect(text).toMatch(/^brandNote:/m);
      if (kind === 'project') expect(text).toMatch(/^(liveUrl|repoUrl):/m);
    }
  });
});
