import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Absolute site URL for canonical, Open Graph and the sitemap. Set SITE_URL,
// or let Vercel provide its production domain at build time.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

export default defineConfig({
  site,
  integrations: site ? [sitemap()] : [],
  build: {
    // Inline the stylesheet: one fewer render-blocking request (CSP already allows inline styles).
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      // Never inline scripts: every script ships as a same-origin file (CSP: script-src 'self').
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 800,
    },
  },
});
