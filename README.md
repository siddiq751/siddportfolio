# Siddiq — Freelance Web Developer Portfolio

A single-page portfolio with a real-time, interactive 3D hero built with Three.js.
Minimal, Apple-inspired, fully responsive and accessible — with no backend required.

- **Stack:** HTML5 · CSS3 · vanilla JavaScript (ES modules) · Three.js · Vite
- **Runtime dependency:** `three` only. Dev dependency: `vite`.
- **Fonts:** Geist + Geist Mono, self-hosted (SIL Open Font License, see `public/fonts/`).

---

## Quick start

Requires **Node.js 20.19+** (or 22.12+).

```bash
npm install        # install dependencies
npm run dev        # local dev server → http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the production build → http://localhost:4173
```

---

## Project structure

```
├── index.html              All page content, case-study templates, SEO meta
├── vite.config.js          Build config + absolute-URL injection for OG tags
├── vercel.json             Cache + security headers for Vercel
├── .env.example            Contact-form settings (copy to .env)
├── public/
│   ├── favicon.svg / favicon-32.png / apple-touch-icon.png
│   ├── og-image.jpg        1200×630 social preview (rendered from the real hero)
│   ├── robots.txt
│   └── fonts/              Geist + Geist Mono (Latin subset) + licence
├── css/
│   ├── style.css           Design tokens, base styles, every component (mobile-first)
│   ├── responsive.css      Tablet / desktop / large-screen layouts
│   └── animations.css      Entrances, reveals, hover states, reduced-motion rules
└── js/
    ├── main.js             Entry: initialises modules, lazy-loads the 3D scenes
    ├── config.js           Contact email, WhatsApp URL, form provider selection
    ├── utils.js            Shared helpers (WebGL check, idle/viewport loaders)
    ├── navigation.js       Sticky nav, active section, dark-section styling, mobile menu
    ├── animations.js       Scroll reveals, hero drift, parallax, magnetic buttons, card tilt
    ├── projects.js         Case-study dialog
    ├── contact.js          Form validation, states and delivery
    ├── hero-3d.js          Hero scene: black chrome sphere, pearl, orbital rings, platform
    ├── about-3d.js         About scene: glass cube, chrome ring, pearl
    └── three/studio.js     Renderer, baked studio lighting, render loop, perf guard
```

There is no `assets/images` or `assets/models` folder: every 3D object is generated in code,
and the project previews are live HTML/CSS mock-ups that stay sharp at any size.

---

## Contact form

The form validates input and has loading, success and error states. How messages are delivered
depends on configuration — **it never pretends to send**.

| Setup | What happens on submit |
|---|---|
| **No key set (default)** | The visitor's email app opens with a pre-filled message to `siddiqmd751@gmail.com`. The page explains this clearly. |
| **Web3Forms key set** | The message is sent to your inbox via Web3Forms; the visitor sees a real success or error state. |
| **Formspree ID set** | Same as above, via Formspree. |

### Option A — Web3Forms (recommended, free)

1. Go to <https://web3forms.com>, enter `siddiqmd751@gmail.com`, and copy the access key emailed to you.
2. Locally: `cp .env.example .env` and set `VITE_WEB3FORMS_ACCESS_KEY=your-key`.
3. On Vercel: **Project → Settings → Environment Variables** → add `VITE_WEB3FORMS_ACCESS_KEY`, then redeploy.

The access key is designed to be public (it only allows sending to your own inbox), so it is safe in client code.

### Option B — Formspree

1. Create a form at <https://formspree.io> — the endpoint looks like `https://formspree.io/f/abcdwxyz`.
2. Set `VITE_FORMSPREE_ID=abcdwxyz` in `.env` and in Vercel's environment variables.

If both are set, Web3Forms is used. A hidden honeypot field quietly drops basic spam bots.

---

## Deploying

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial portfolio"
git branch -M main
# Create an empty repo on github.com first (no README), then:
git remote add origin https://github.com/<your-username>/siddiq-portfolio.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `dist` and `.env`.

### 2. Deploy on Vercel

1. Sign in at <https://vercel.com> with GitHub → **Add New… → Project** → import the repository.
2. Vercel detects **Vite** automatically (build `npm run build`, output `dist`). Keep the defaults.
3. Add the contact-form environment variable (see above) if you have one.
4. Click **Deploy**. Every push to `main` redeploys automatically.

Canonical and Open Graph URLs become absolute automatically on Vercel (from
`VERCEL_PROJECT_PRODUCTION_URL`). With a custom domain, set `SITE_URL=https://yourdomain.com`
as an environment variable so social previews use it.

---

## Editing content

- **Text, projects, services, skills:** all in `index.html`.
- **Case studies:** the `<template id="case-…">` blocks at the bottom of `index.html`. The desktop
  preview reuses the card's mock-up automatically.
- **Real screenshots:** when a project is built, you can replace a `.mock` block with an
  `<img>` (keep `alt` text descriptive) — the frames and hover effects still work.
- **Contact details:** `index.html` and `js/config.js`.
- **Colours, type scale, spacing:** CSS custom properties at the top of `css/style.css`.

Please keep the honesty rules: projects are labelled **Concept Project**, there are no invented
clients, testimonials or statistics, and the skills list should only include tools you actually use.

---

## How the 3D works

- **Procedural & asset-free:** spheres, rings, the lathe-turned platform and the rounded glass cube
  are generated in code — no model or texture downloads.
- **Studio lighting:** a graded room with emissive softboxes is baked once into a PMREM
  environment map, giving chrome and glass crisp reflections without real-time reflection passes.
  Shadows are baked radial textures, not shadow maps.
- **Interaction:** the camera orbits subtly with the cursor (so reflections shift), the scene can be
  dragged horizontally (touch-friendly: vertical swipes still scroll), hovering the black sphere
  quickens the orbits, and scrolling tilts the composition.
- **Performance:** Three.js loads in its own chunk *after* first paint; the About scene loads only
  when you scroll near it. Shaders compile asynchronously. Rendering stops when a scene is off-screen
  or the tab is hidden, pixel ratio is capped (1.5 on phones, 1.75 on desktop) and drops
  automatically if frames are slow.
- **Fallbacks:** a CSS rendition of each composition is shown while loading and stays in place if
  WebGL 2 is unavailable or the GPU context is lost. With *Reduce Motion* enabled, scenes render a
  single still frame and all page animations are disabled.

---

## Quality checks (at time of build)

- Lighthouse — mobile: Performance 98 · Accessibility 100 · Best Practices 100 · SEO 100;
  desktop: 100 · 100 · 100 · 100 (CLS 0).
- Tested at 320, 375, 430, 768, 1024, 1440 and 1920 px widths with no horizontal overflow.
- Automated browser checks covered navigation, CTAs, mobile menu (incl. Esc and focus return),
  case-study dialogs, form validation and all delivery states, WhatsApp/email links,
  3D interaction, render pausing, reduced motion and the no-WebGL fallback — with no console errors.
