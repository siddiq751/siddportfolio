import { Fog, MathUtils, PerspectiveCamera, Raycaster, Scene, Sphere, Vector2, Vector3 } from 'three';
import { QUALITY, bakeEnvironment, createRenderer } from './renderer.js';
import { POOLS, createFloor, createMotes, createSky } from './environment.js';
import { createCore } from './core.js';
import { WORKS_Z, createInstruments, createOrigin, createPortal, createWorks } from './stations.js';
import { srgb } from './glsl.js';
import { isSoftwareRenderer } from './tiers.js';

/** Yield to the browser so construction never blocks input for long. */
const yieldToMain = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));

const { clamp, damp, lerp, smoothstep } = MathUtils;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Where the camera stands at each station. The camera never pitches: the horizon
 * stays fixed on screen (the golden line on wide screens) and the world moves around it.
 *   at: the point the station is composed around · dist/h: camera distance and height (a → b while dwelling)
 *   fit: width (world units) that must fit on narrow screens
 */
const STATIONS = {
  // `m`: portrait framing. The hero camera drops low so the Core rises above the name.
  home: {
    at: [0, 0],
    a: { dist: 9.4, h: 1.38 },
    b: { dist: 7.8, h: 1.55 },
    m: { a: { dist: 8.4, h: 0.5 }, b: { dist: 7.6, h: 0.62 } },
    fit: 5.6,
    light: 1,
    glow: 1,
  },
  origin: { at: [0, -30], a: { dist: 8.6, h: 1.6 }, b: { dist: 7.2, h: 1.85 }, fit: 4.4, light: 0.6, glow: 0.55 },
  instruments: { at: [0, -52], a: { dist: 8.6, h: 1.75 }, b: { dist: 7.4, h: 2.05 }, fit: 6.4, light: 0.5, glow: 0.45 },
  works: { at: [0, WORKS_Z], a: { dist: 9.4, h: 1.7 }, b: { dist: 9.4, h: 1.7 }, fit: 5, light: 0.65, glow: 0.5 },
  contact: {
    at: [0, -120],
    a: { dist: 9.6, h: 1.55 },
    b: { dist: 8.2, h: 1.7 },
    fit: 6,
    shift: -1.1,
    light: 0.9,
    glow: 0.8,
  },
};

export async function mountWorld(container, { tier, intro }) {
  const quality = QUALITY[tier] ?? QUALITY[2];
  const canvas = document.createElement('canvas');
  container.append(canvas);
  const renderer = createRenderer(canvas, quality);
  if (isSoftwareRenderer(renderer.getContext())) {
    renderer.dispose();
    canvas.remove();
    return null;
  }
  await yieldToMain();
  const root = document.documentElement;
  const osReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => osReduce.matches || root.dataset.motion === 'reduced';

  const scene = new Scene();
  scene.environment = bakeEnvironment(renderer);
  await yieldToMain();
  // Linear fog that starts behind the subject: the station you're at stays crisp,
  // the next one dissolves into the atmosphere.
  scene.fog = new Fog(0x0d0e0d, 12, 38);
  const camera = new PerspectiveCamera(34, 1, 0.1, 900);

  // ---------- Content ----------
  const sky = createSky();
  const floor = createFloor();
  const motes = createMotes(quality.motes);
  const core = createCore(quality);
  await yieldToMain();
  const origin = createOrigin(quality);
  await yieldToMain();
  const skillGroups = [...document.querySelectorAll('[data-skill-group]')].map((g) => [
    ...g.querySelectorAll('[data-skill]'),
  ]);
  const instruments = createInstruments(quality, skillGroups);
  const images = [...document.querySelectorAll('#works .work-card img')].map((img) => img.getAttribute('src'));
  const works = createWorks(images.length ? images : [null]);
  await yieldToMain();
  const portalX = works.slabX(works.count - 1);
  STATIONS.contact.at[0] = portalX;
  const portal = createPortal(new Vector3(portalX, 2.42, -120));
  scene.add(sky, floor.mesh, motes, core.group, origin.group, instruments.group, works.group, portal.group);

  const stationObjects = { home: core, origin, instruments, works, contact: portal };
  const poolSources = [
    { x: 0, z: 0.4, r: 2.0, color: [1, 0.54, 0.24], strength: 0.07 },
    ...origin.pools,
    ...instruments.pools,
    ...works.pools,
    ...portal.pools,
  ];

  // ---------- Layout: keyframes from the real page ----------
  let frames = [];
  let wide = true;
  let fitScale = 1;
  const gallery = window.matchMedia('(min-width: 1024px)');

  const layout = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    wide = camera.aspect >= 1;
    camera.fov = wide ? 34 : 50;
    // Horizon at the golden line (wide) or 45% (narrow); subject to the right on wide screens.
    const horizon = wide ? 0.618 : 0.45;
    camera.setViewOffset(w, h, wide ? -w * 0.2 : 0, -(horizon - 0.5) * h, w, h);
    camera.updateProjectionMatrix();
    const halfH = Math.tan(MathUtils.degToRad(camera.fov / 2));
    fitScale = halfH * camera.aspect;

    const vh = window.innerHeight;
    frames = [];
    for (const [id, def] of Object.entries(STATIONS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const height = el.offsetHeight;
      let a;
      let b;
      if (id === 'home') {
        a = 0;
        b = Math.max(0, height - vh) + vh * 0.2;
      } else if (id === 'works' && gallery.matches) {
        a = top;
        b = top + height - vh;
      } else {
        a = top - vh * 0.3;
        b = Math.max(a, top + height - vh * 0.75);
      }
      frames.push({ id, def, a, b });
    }
  };

  /** Camera position for a station at dwell progress u (0..1). */
  const stationPose = (frame, u, out) => {
    const { def, id } = frame;
    const portrait = !wide && def.m;
    const pa = portrait ? def.m.a : def.a;
    const pb = portrait ? def.m.b : def.b;
    const dist0 = lerp(pa.dist, pb.dist, u);
    const need = wide || portrait ? 0 : def.fit / (2 * fitScale);
    const dist = Math.max(dist0, need);
    let x = def.at[0] + (wide ? (def.shift ?? 0) : 0);
    if (id === 'works')
      x = works.slabX(0) + (works.slabX(works.count - 1) - works.slabX(0)) * (gallery.matches ? u : 0);
    return out.set(x, lerp(pa.h, pb.h, u) + (wide || portrait ? 0 : 0.35), def.at[1] + dist);
  };

  const pose = new Vector3();
  const from = new Vector3();
  let stationT = 0;
  const target = (scroll) => {
    if (!frames.length) return pose.set(0, 1.5, 9);
    if (reduced()) {
      // No camera travel: cut to the station in view.
      let i = 0;
      frames.forEach((f, n) => scroll >= f.a - window.innerHeight * 0.2 && (i = n));
      stationT = i;
      return stationPose(frames[i], 0.5, pose);
    }
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (scroll < f.a) {
        if (i === 0) {
          stationT = 0;
          return stationPose(f, 0, pose);
        }
        const prev = frames[i - 1];
        const t = clamp((scroll - prev.b) / Math.max(f.a - prev.b, 1), 0, 1);
        const e = ease(t);
        stationPose(prev, 1, from);
        stationPose(f, 0, pose);
        const span = from.distanceTo(pose);
        pose.lerpVectors(from, pose, e);
        pose.y += Math.sin(Math.PI * e) * Math.min(0.9, span * 0.025);
        stationT = i - 1 + e;
        return pose;
      }
      if (scroll <= f.b) {
        stationT = i;
        const u = f.b > f.a ? (scroll - f.a) / (f.b - f.a) : 0;
        if (f.id === 'works' && gallery.matches && works.count > 1) {
          // Pause at each slab: ease within each slab-to-slab segment.
          const seg = u * (works.count - 1);
          const k = Math.min(Math.floor(seg), works.count - 2);
          return stationPose(f, (k + ease(seg - k)) / (works.count - 1), pose);
        }
        return stationPose(f, u, pose);
      }
    }
    const last = frames[frames.length - 1];
    stationT = frames.length - 1;
    return stationPose(last, 1, pose);
  };

  // ---------- Interaction ----------
  const pointer = new Vector2();
  const pointerSmooth = new Vector2();
  const ndc = new Vector2(9, 9);
  const raycaster = new Raycaster();
  const camPos = new Vector3();
  let hoverCore = 0;
  let flyTo = null;
  let paused = false;
  let lastInput = performance.now();

  const onPointerMove = (event) => {
    lastInput = performance.now();
    if (event.pointerType !== 'mouse') return;
    pointer.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
    ndc.set(pointer.x, -pointer.y);
  };
  // Analytic hit test (the Core is a sphere) — no per-triangle raycasting.
  const coreSphere = new Sphere(new Vector3(), 1.02);
  const hitPoint = new Vector3();
  const hitCore = () => {
    raycaster.setFromCamera(ndc, camera);
    coreSphere.center.copy(core.worldPosition());
    const hit = raycaster.ray.intersectSphere(coreSphere, hitPoint);
    return hit ? hitPoint.clone().sub(coreSphere.center) : null;
  };
  const onClick = (event) => {
    if (event.target.closest('a, button, input, select, textarea, label, dialog')) return;
    const dir = hitCore();
    if (dir) core.ripple(dir);
  };
  const markInput = () => (lastInput = performance.now());
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('click', onClick);
  window.addEventListener('scroll', markInput, { passive: true });

  const listeners = {
    'dimension:skill': (e) => instruments.highlight(e.detail.group, e.detail.item),
    'dimension:filter': (e) => instruments.filter(e.detail.group),
    'dimension:work': (e) => works.setActive(e.detail.index),
    'dimension:open-work': (e) => (flyTo = works.screenAnchor(e.detail.index).add(new Vector3(0, -0.1, 1.9))),
    'dimension:transmit': () => portal.pulse(),
    'dimension:skip-intro': () => (introT = 1),
    'dimension:overlay': (e) => (paused = e.detail.open),
    'dimension:settings': () => requestFrame(),
  };
  Object.entries(listeners).forEach(([name, fn]) => window.addEventListener(name, fn));

  // ---------- Frame ----------
  let introT = intro && !reduced() ? 0 : 1;
  const light = { level: 1, glow: 1 };
  const far = new Vector3();
  const lineColor = new Vector3(...srgb(0xff8a3d));
  const midColor = new Vector3(...srgb(0x0c0e0d));
  let firstFrame = true;

  const update = (dt) => {
    const motion = !reduced();
    if (introT < 1) introT = Math.min(1, introT + dt / 2.8);

    target(window.scrollY);
    if (motion) {
      pointerSmooth.x = damp(pointerSmooth.x, pointer.x, 2.4, dt);
      pointerSmooth.y = damp(pointerSmooth.y, pointer.y, 2.4, dt);
    } else {
      pointerSmooth.set(0, 0);
    }
    pose.x += pointerSmooth.x * 0.28;
    pose.y -= pointerSmooth.y * 0.12;

    // Intro: the camera starts low on the horizon and rises as the Core emerges.
    const introCam = 1 - smoothstep(introT, 0.35, 1);
    pose.y = lerp(pose.y, 0.55, introCam);
    pose.z += introCam * 1.4;
    if (flyTo) pose.copy(flyTo);

    if (firstFrame || !motion) camPos.copy(pose);
    else {
      const k = flyTo ? 4.5 : 5;
      camPos.x = damp(camPos.x, pose.x, k, dt);
      camPos.y = damp(camPos.y, pose.y, k, dt);
      camPos.z = damp(camPos.z, pose.z, k, dt);
    }
    camera.position.copy(camPos);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld();

    // Light follows the station (a day cycle from first light to night).
    const i0 = Math.floor(stationT);
    const i1 = Math.min(i0 + 1, frames.length - 1);
    const f = stationT - i0;
    const d0 = frames[i0]?.def ?? STATIONS.home;
    const d1 = frames[i1]?.def ?? d0;
    light.level = lerp(d0.light, d1.light, f) * lerp(0.35, 1, smoothstep(introT, 0, 0.6));
    light.glow = lerp(d0.glow, d1.glow, f);

    sky.position.copy(camPos);
    sky.material.uniforms.uIntensity.value = light.level;
    sky.material.uniforms.uGlow.value = light.glow;
    sky.material.uniforms.uReveal.value = smoothstep(introT, 0, 0.55);
    floor.mesh.position.set(camPos.x, 0, camPos.z);
    floor.mesh.material.uniforms.uIntensity.value = light.level;
    far.copy(midColor).lerp(lineColor, 0.1 * light.level);
    floor.mesh.material.uniforms.uFar.value.copy(far);

    // Nearest light pools to the camera.
    poolSources
      .map((p) => ({ p, d: (p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, POOLS)
      .forEach(({ p }, n) => {
        floor.pools[n].set(p.x, p.z, p.r, p.strength * light.level);
        floor.poolColors[n].set(...p.color);
      });

    motes.material.uniforms.uTime.value += motion ? dt : 0;
    motes.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();

    // Core: touch response + intro rise.
    const touching = motion && stationT < 0.6 ? hitCore() : null;
    if (touching) core.setPoint(touching);
    hoverCore = damp(hoverCore, touching ? 1 : 0, 6, dt);
    const rise = smoothstep(introT, 0.12, 0.8);
    const flare = intro ? Math.sin(Math.PI * smoothstep(introT, 0.25, 1)) * 1.2 : 0;
    const ctx = { motion, camera, energy: hoverCore, rise, glow: 0.32 + flare };
    // Architecture rises out of the floor as the camera approaches it.
    const presence = { origin: smoothstep(stationT, 0.02, 0.45), works: smoothstep(stationT, 2.1, 2.85) };

    for (const [id, obj] of Object.entries(stationObjects)) {
      const index = frames.findIndex((fr) => fr.id === id);
      const near =
        index === -1 ? id === 'home' : Math.abs(stationT - index) < 1.6 || (id === 'origin' && stationT < 1.6);
      obj.group.visible = near;
      if (near) obj.update(dt, { ...ctx, presence: presence[id] ?? 1, gallery: gallery.matches });
    }
    if (stationT > 1.4) works.load(renderer.capabilities.getMaxAnisotropy());
  };

  // ---------- Loop (paused when hidden, covered or idle-throttled) ----------
  let frameId = 0;
  let last = performance.now();
  let running = false;
  let skip = false;
  const perf = { frames: 0, total: 0, done: false };

  const render = () => renderer.render(scene, camera);
  const tick = (now) => {
    frameId = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    // After 6s without input, render at half rate to save power.
    const idle = now - lastInput > 6000 && introT >= 1;
    if (idle && (skip = !skip)) return;
    last = now;
    if (paused) return;
    update(dt);
    render();
    if (firstFrame) {
      firstFrame = false;
      container.classList.add('is-ready');
    }
    if (!perf.done && !idle) {
      perf.frames++;
      perf.total += dt;
      if (perf.frames === 120) {
        perf.done = true;
        if (perf.total / perf.frames > 1 / 40 && renderer.getPixelRatio() > 1) {
          renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.7));
          layout();
        }
      }
    }
  };
  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    frameId = requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(frameId);
  };
  const requestFrame = () => {
    if (!running && !document.hidden) {
      update(0);
      render();
    }
  };
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const resizeObserver = new ResizeObserver(() => {
    layout();
    requestFrame();
  });
  resizeObserver.observe(container);
  // Page height changes (fonts, images) move the keyframes.
  const bodyObserver = new ResizeObserver(() => layout());
  bodyObserver.observe(document.body);

  // GPU context loss: show the CSS still; rebuild the baked light when restored.
  const onLost = (event) => {
    event.preventDefault();
    stop();
    container.classList.remove('is-ready');
  };
  const onRestored = () => {
    scene.environment?.dispose();
    scene.environment = bakeEnvironment(renderer);
    firstFrame = true;
    start();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  layout();
  update(0);
  renderer.compileAsync(scene, camera).finally(() => {
    if (!document.hidden) start();
  });

  return {
    dispose() {
      stop();
      resizeObserver.disconnect();
      bodyObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', markInput);
      Object.entries(listeners).forEach(([name, fn]) => window.removeEventListener(name, fn));
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      [core, origin, instruments, works, portal].forEach((o) => o.dispose());
      sky.geometry.dispose();
      sky.material.dispose();
      floor.mesh.geometry.dispose();
      floor.mesh.material.dispose();
      motes.geometry.dispose();
      motes.material.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      container.classList.remove('is-ready');
      canvas.remove();
    },
  };
}
