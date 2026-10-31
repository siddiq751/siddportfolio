// Renders preview images from the running site:
//   public/works/<slug>.jpg       16:10 screen textures + card images (from the study mock-ups)
//   public/works/<slug>-og.jpg    1200×630 social images for case studies
//   public/og-image.jpg           1200×630 social image for the home page (the real 3D hero)
//   public/favicon-32.png, public/apple-touch-icon.png (from public/favicon.svg)
// Usage: npm run build && npm run preview   (in another terminal)  then  npm run assets
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.ASSETS_URL || 'http://localhost:4321';
const SLUGS = ['coaching', 'portfolio', 'restaurant'];
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : 'chrome',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});

async function mockShot(slug, width, height, path, type) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE}/work/${slug}/`, { waitUntil: 'networkidle' });
  // Show only the desktop mock, full-bleed at the target size.
  await page.addStyleTag({
    content: `
      body > *:not(main) { display: none !important; }
      main { position: fixed; inset: 0; z-index: 9999; background: #111; }
      .doc > *:not(.doc__previews) { display: none !important; }
      .doc { padding: 0 !important; max-width: none !important; }
      .doc__previews { position: fixed; inset: 0; margin: 0; padding: 0; display: block; background: none; }
      .doc__previews figure:nth-child(2), figcaption, .browser__bar { display: none !important; }
      .browser { border-radius: 0 !important; box-shadow: none !important; }
      .browser__view { width: ${width}px; height: ${height}px; overflow: hidden; aspect-ratio: auto !important; }
    `,
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path, type, quality: type === 'png' ? undefined : 82 });
  await page.close();
}

for (const slug of SLUGS) {
  await mockShot(slug, 1600, 1000, `public/works/${slug}.jpg`, 'jpeg');
  await mockShot(slug, 1200, 630, `public/works/${slug}-og.jpg`, 'jpeg');
  console.log(`✓ ${slug}`);
}

// Home social image: the real hero, framed for 1200×630.
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.addInitScript(() => sessionStorage.setItem('dimension:intro', '1'));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `.topbar__actions, .rail, .pill, .hero__intro, .hero__actions, .skip-intro { display: none !important; }
      .hero { min-height: 630px !important; grid-template-rows: 61.8vh auto !important; }
      * { animation: none !important; }`,
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'public/og-image.jpg', type: 'jpeg', quality: 86 });
  await page.close();
  console.log('✓ og-image');
}

// Icons from the SVG mark.
const svg = readFileSync('public/favicon.svg', 'utf8');
for (const [size, file, pad] of [
  [32, 'public/favicon-32.png', 0],
  [180, 'public/apple-touch-icon.png', 0],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;padding:${pad}px;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
  );
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
}
console.log('✓ icons');
await browser.close();
