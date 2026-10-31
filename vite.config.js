import { defineConfig } from 'vite';

// Absolute site URL for canonical + Open Graph tags. Set SITE_URL yourself,
// or let Vercel provide its production domain automatically at build time.
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
).replace(/\/$/, '');

function siteUrlPlugin() {
  return {
    name: 'site-url',
    transformIndexHtml(html) {
      // Without a known domain, drop tags that must be absolute; keep the rest relative.
      if (!siteUrl) html = html.replace(/\n\s*<(?:link|meta)[^>]*"__SITE_URL__\/"[^>]*>/g, '');
      return html.replaceAll('__SITE_URL__', siteUrl);
    },
  };
}

export default defineConfig({
  plugins: [siteUrlPlugin()],
  build: {
    target: 'es2020',
    // three.js lives in its own lazily-loaded chunk and is expected to be large.
    chunkSizeWarningLimit: 800,
  },
});
