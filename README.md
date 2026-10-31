# Siddiq — The Digital Dimension

An immersive portfolio: a dark, architectural 3D world (Three.js) that you travel through by
scrolling, with every piece of content in fast, accessible HTML on top of it.

- **The concept — "Horizon":** an infinite stone plane, one line of warm light, and _the Core_ —
  a black chrome sphere that rises on the horizon in eclipse. Scrolling moves the camera through
  five stations (Core → Origin → Instruments → Works → Transmission) and through a day of light.
  The horizon never moves on screen; the world moves around it.
- **Stack:** Astro 7 (static output, no UI framework) · vanilla JavaScript · Three.js 0.187.
  One optional Vercel Function for the AI assistant.
- **Fonts:** Archivo (variable width + weight, subset to what's used) and Geist Mono, self-hosted (OFL).

> v1 of the site (light, Vite) is preserved on the `main` branch at commit `499ab59`.

---

## Quick start

Requires **Node.js 22.12+** (Astro is pinned to 7.3 so it runs on Node 22.12–22.22).

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site → dist/
npm run preview    # serve dist/ (a managed server: `npx astro preview stop` stops it)
```

| Script             | What it does                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `npm run lint`     | ESLint + Prettier check                                                                      |
| `npm test`         | Unit tests (Vitest): content, form rules, assistant guardrails, CSP hash                     |
| `npm run test:e2e` | Browser tests (Playwright, desktop + mobile) — builds and serves the site itself             |
| `npm run check`    | All of the above + build                                                                     |
| `npm run assets`   | Regenerates study screenshots, Open Graph images and icons (needs `npm run preview` running) |

---

## Editing content (one source of truth)

Everything visitors read — and everything the AI assistant may say — comes from two places:

- **`src/content/site.json`** — name, role, availability, headline, about, skills, services,
  process, contact details, links, CV. Only verified information belongs here.
- **`src/content/projects/*.md`** — one file per project (frontmatter only).

### Adding a real project

```yaml
---
title: My Real Project
kind: project # 'project' = real work; 'study' = self-initiated concept
category: Business Website
order: 1 # position in the Works hall
summary: One line about it.
overview: …
objective: …
features: [Feature one, Feature two]
stack: [HTML5, CSS3, JavaScript] # only what you actually used
image: /works/my-project.jpg # 1600×1000 screenshot in public/works/
liveUrl: https://… # a real project needs liveUrl or repoUrl (enforced at build)
repoUrl: https://github.com/…
year: 2026
contactType: Business Website
---
```

Real projects are labelled **Project**; studies are always labelled **Concept study** with their
fictional-brand note. Once a real project exists, the Works heading switches from
"Studies in craft." to "Selected work." automatically. Add `my-project-og.jpg` (1200×630) next to
the image for the case study's social preview.

### Designed, waiting for your information

Two more stations — **Path** (experience, education, certifications) and **Signal** (live GitHub
activity) — plus a CV page and a photo in Origin are part of the approved design but deliberately
not built yet: they need verified data first. They slot into `src/lib/stations.js` with their
components.

---

## Contact form

Validation, loading, success and error states are built in. Delivery depends on configuration —
the form never pretends to send:

| Setup                         | On submit                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Nothing set (default)         | Opens the visitor's email app with the message pre-filled                          |
| `PUBLIC_WEB3FORMS_ACCESS_KEY` | Delivered to your inbox via [Web3Forms](https://web3forms.com) (free, recommended) |
| `PUBLIC_FORMSPREE_ID`         | Delivered via [Formspree](https://formspree.io)                                    |

Set the variable in `.env` locally and in Vercel → Settings → Environment Variables, then redeploy.
After the first deploy, **send yourself one real test message**.

---

## AI assistant ("Ask") — optional, off by default

Answers questions about your work **only** from facts the build generates from `src/content`
(`/assistant-facts.json`). It refuses to guess anything that isn't there (experience, clients,
prices…) and links to the section it used.

To enable on Vercel:

```
PUBLIC_ASK_ENABLED=true     # shows the Ask button
ASK_ENABLED=true            # lets the API answer
ANTHROPIC_API_KEY=…         # server-side only
ASK_MODEL=                  # empty = claude-opus-5-5; claude-haiku-5-5 is far cheaper
```

- **Model:** Claude Opus 5.5 by default at `low` effort, with server-side refusal fallback on.
  Claude Haiku 5.5 is a sensible, much cheaper choice for this kind of Q&A — your call.
- **Cost controls:** prompt caching on the fixed facts, short answers, input limits (500 chars,
  last 6 turns), a per-visitor rate limit and a daily cap. Those limits live in one serverless
  instance's memory, so **also set a monthly spend limit in the Claude Console** (and optionally a
  Vercel Firewall rate-limit rule on `/api/ask`).
- **Privacy:** message text isn't logged by the site; the privacy page describes the assistant
  whenever it's enabled.
- **Before launch:** ask it 30–50 test questions, including ones it must refuse.
- `api/ask.js` is a standalone Vercel Function — confirm `/api/ask` responds after the first deploy.

---

## The 3D world

- Home page only; loads after first paint when the browser is idle, and builds in small steps.
- **Quality tiers** (`src/scripts/world/tiers.js`): high-end desktop, laptop, mobile — and a CSS
  still with no Three.js download for Data Saver, software GPUs, no WebGL 2, or "3D off".
- **Index → Experience settings** (⌘K / Ctrl+K): _Reduce motion_ (no intro, no camera travel),
  _3D world_ on/off (remembered), _Immersive mode_ (fullscreen, desktop).
- Pauses when the tab is hidden or an overlay is open, halves its frame rate after 6 s without
  input, lowers resolution on slow GPUs, and recovers from GPU context loss.
- Fully procedural — no models or textures to download except the project screenshots.

---

## Security

`vercel.json` sets a strict Content-Security-Policy (no inline scripts except the boot script,
allowed by its SHA-256 hash), HSTS, `frame-ancestors 'none'`, Permissions-Policy and more.

**If you edit `public/boot.js`, update its hash in `vercel.json`** — `npm test` fails until you do.
Recompute with:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('public/boot.js')).digest('base64'))"
```

`npm audit --omit=dev` reports no known vulnerabilities in production dependencies (an npm
`overrides` entry pins a nested `zod` copy in Astro's tree to a patched release). ESLint's own
dependencies carry moderate advisories that affect development tooling only.

---

## Deploying

1. **GitHub:** create an empty repository, then
   ```bash
   git remote add origin https://github.com/<you>/siddiq-portfolio.git
   git push -u origin main v2-dimension
   ```
   Open a pull request from `v2-dimension` into `main` and merge when you're happy.
2. **Vercel:** import the repository — it detects Astro (build `npm run build`, output `dist`).
   Add the environment variables above. Every pull request gets a preview URL; every merge to
   `main` deploys; any earlier deployment can be promoted back instantly (rollback).
3. **Domain:** add it in Vercel (HTTPS is automatic) and set `SITE_URL=https://yourdomain` so
   canonical URLs, social previews and the sitemap use it.
4. **CI:** `.github/workflows/ci.yml` runs lint, unit tests, build, Playwright and Lighthouse
   budgets (≥ 95 performance, accessibility, SEO) on every pull request. Dependabot opens update PRs.

Optional later: Vercel Web Analytics / Speed Insights (cookie-free) and a free uptime monitor.

---

## Measured quality (local production build)

| Page             | Performance | Accessibility | Best practices | SEO |
| ---------------- | ----------- | ------------- | -------------- | --- |
| Home — mobile    | 97–98       | 100           | 100            | 100 |
| Home — desktop   | 100         | 100           | 100            | 100 |
| Privacy — mobile | 100         | 100           | 100            | 100 |

Lighthouse in headless Chrome against `npm run preview`; mobile uses simulated slow 4G and 4× CPU
slowdown. Home on mobile: LCP 2.3 s, TBT 60–140 ms, CLS 0.014. These are lab numbers from one
machine — check real-visitor data in Vercel Speed Insights after launch.
