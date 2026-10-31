import { getCollection } from 'astro:content';
import site from '../content/site.json';
import { buildFacts, buildSystemPrompt } from '../lib/facts.js';

// Built at deploy time from the same content the site renders. Public by design:
// everything in it is already published on the site.
export async function GET() {
  const projects = (await getCollection('projects')).map((p) => ({ slug: p.id, ...p.data }));
  const facts = buildFacts(site, projects);
  return new Response(JSON.stringify({ system: buildSystemPrompt(site, facts) }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
