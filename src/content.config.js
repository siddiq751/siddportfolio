import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Projects: `kind: project` is real, shipped work (needs links); `kind: study` is a
// self-initiated concept and is always labelled as such on the site.
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z
    .object({
      title: z.string(),
      kind: z.enum(['project', 'study']),
      category: z.string(),
      order: z.number(),
      summary: z.string(),
      brand: z.string().optional(),
      brandNote: z.string().optional(),
      overview: z.string(),
      objective: z.string(),
      features: z.array(z.string()).min(1),
      stack: z.array(z.string()).min(1),
      mock: z.enum(['coaching', 'folio', 'ember']).optional(),
      image: z.string().optional(),
      liveUrl: z.string().url().optional(),
      repoUrl: z.string().url().optional(),
      year: z.number().optional(),
      contactType: z.string().default('Something else'),
    })
    .refine((p) => p.kind === 'study' || p.liveUrl || p.repoUrl, {
      message: 'Real projects need a live or repository link.',
    }),
});

export const collections = { projects };
