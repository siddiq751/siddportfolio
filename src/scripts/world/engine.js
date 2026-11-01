import { Fog, MathUtils, PerspectiveCamera, Raycaster, Scene, Sphere, Vector2, Vector3 } from 'three';
import { QUALITY, bakeEnvironment, createRenderer } from './renderer.js';
import { POOLS, createFloor, createSky } from './environment.js';
import { createCore } from './core.js';
import { WORKS_Z, createInstruments, createOrigin, createPortal, createStudioFill, createWorks } from './stations.js';
import { isSoftwareRenderer } from './tiers.js';
import { workFocus, workIndex } from '../../lib/works-track.js';

/** Yield to the browser so construction never blocks input for long. */
const yieldToMain = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));

const { clamp, damp, lerp, smoothstep } = MathUtils;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 0 at both ends of a move and 1 at `peak`, leaving and arriving gently. */
const hump = (e, peak) => {
  const k = e < peak ? e / peak : (1 - e) / (1 - peak);
  return k * k * (3 - 2 * k);
};

/**
 * How the studio follows the page. Camera, objects and light are all functions of one softened
 * copy of the scroll position, so the film can never run ahead of the copy or behind it.
 *   follow: spring smoothing (s) — turns wheel notches into a glide, and settles within half a
 *           second of the page coming to rest
 *   reading: the line copy is read at (share of the viewport height). A station is framed while
 *            its copy crosses it; the camera travels while the gap between two stations does.
 *   travel: the shortest move between two stations, in viewport heights, for a journey of `span`
 *           world units — longer journeys get proportionally more scroll, so every move runs at
 *           about the same speed
 *   jump: stations an in-page link (Index, rail, hero buttons) must cross before the view dips
 *         to white rather than racing through the studio
 *   dip: seconds the view takes to dip to white (matches .is-dipping in stations.css)
 */
const SYNC = { follow: 0.18, reading: 0.5, travel: 0.85, span: 28, jump: 1.5, dip: 0.25 };

/** Critically damped spring (Unity's SmoothDamp): no overshoot, no velocity jumps. */
function smoothDamp(from, to, velocity, time, dt) {
  const omega = 2 / time;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = from - to;
  const temp = (velocity + omega * change) * dt;
  let v = (velocity - omega * temp) * decay;
  let out = to + (change + temp) * decay;
  if (to - from > 0 === out > to) {
    out = to;
    v = 0;
  }
  return [out, v];
}

/**
 * Where the camera stands at each station. The camera never pitches: the horizon
 * stays fixed on screen (the golden line on wide screens) and the studio moves around it.
 *   at: the point the station is composed around · dist/h: camera distance and height (a → b while there)
 *   shift: sideways offset on wide screens, so the subject sits clear of the copy
 *   drift: sideways drift on wide screens while there (a → b), so the subject turns as you read
 *   fit: width (world units) that must fit on narrow screens
 *   light: how strongly the horizon seam and floor shadows read at that station
 *   exposure: the studio's exposure there — airy for the Core and the finale, richer for the metal
 *   swing, crane: how far the camera swings aside (− = the viewer's left) and rises leaving this
 *          station, so it passes the sculpture rather than going through it. Passing on the left
 *          keeps each subject exiting on the right, away from the copy.
 *   peak: where in that move it passes the sculpture (0..1)
 */
const STATIONS = {
  // `m`: portrait framing. The hero camera drops low so the Core rises above the name.
  home: {
    at: [0, 0],
    a: { dist: 9.4, h: 1.38 },
    b: { dist: 8.9, h: 1.44 },
    m: { a: { dist: 8.4, h: 0.5 }, b: { dist: 8, h: 0.56 } },
    fit: 5.6,
    light: 1,
    exposure: 1,
    // Past the Core and its rings, then into the slit between the monoliths.
    swing: -3.4,
    crane: 0.9,
    peak: 0.3,
  },
  origin: {
    at: [0, -30],
    a: { dist: 10.4, h: 1.68 },
    b: { dist: 9.3, h: 1.82 },
    drift: [0.45, -0.25],
    fit: 4.4,
    light: 0.8,
    exposure: 1.03,
    swing: -2.7,
    crane: 0.8,
    peak: 0.45,
  },
  instruments: {
    at: [0, -52],
    a: { dist: 11.4, h: 1.95 },
    b: { dist: 10.3, h: 2.05 },
    shift: -0.9,
    fit: 6.4,
    light: 0.7,
    exposure: 0.95,
    swing: -3.6,
    crane: 1,
    peak: 0.4,
  },
  works: {
    at: [0, WORKS_Z],
    a: { dist: 11, h: 1.75 },
    b: { dist: 10.5, h: 1.75 },
    shift: -0.25,
    fit: 5,
    light: 0.85,
    exposure: 0.97,
    // Out between the last two screens.
    swing: -3.4,
    crane: 0.9,
    peak: 0.28,
  },
  // The portal waits in the distance through the services, then the camera comes in and settles
  // low, so the ring rises over the footer at the end of the page.
  contact: {
    at: [0, -120],
    a: { dist: 15, h: 1.55 },
    b: { dist: 10.8, h: 1.1 },
    fit: 6,
    light: 1,
    exposure: 1.05,
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
  // Linear studio haze that starts behind the subject: the station you're at stays crisp,
  // the next one dissolves into the white.
  scene.fog = new Fog(0xf1f1f1, 14, 44);
  const camera = new PerspectiveCamera(34, 1, 0.1, 900);

  // ---------- Content ----------
  const sky = createSky();
  const floor = createFloor();
  const fill = createStudioFill();
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
  const portal = createPortal(new Vector3(portalX, 2.16, -120));
  scene.add(sky, floor.mesh, fill, core.group, origin.group, instruments.group, works.group, portal.group);

  const stationObjects = { home: core, origin, instruments, works, contact: portal };
  const pools = [...origin.pools, ...instruments.pools, ...works.pools, ...portal.pools].map((p) => ({ p, d: 0 }));

  // ---------- Timeline: keyframes from where the copy actually sits ----------
  // Each frame: a..b is the scroll range the camera holds at the station (between the moves in
  // and out of it), u0..u1 the range its slow push plays over.
  let frames = [];
  let maxScroll = 0;
  let wide = true;
  let fitScale = 1;
  const gallery = window.matchMedia('(min-width: 1024px)');
  const legFrom = new Vector3();
  const legTo = new Vector3();

  /** Page-space extent of a station's copy (its [data-beat] blocks). */
  const copyOf = (section, vh) => {
    const top = section.getBoundingClientRect().top + window.scrollY;
    const beats = [...section.querySelectorAll('[data-beat]')];
    // The pinned Works stage moves with the scroll while it is pinned: place it where it pins.
    if (section.id === 'works' && gallery.matches) {
      const edge = (vh - (beats[0]?.offsetHeight ?? vh)) / 2;
      const pin = [top, top + section.offsetHeight - vh];
      return { top: top + edge, bottom: pin[1] + vh - edge, pin };
    }
    const rects = beats.map((b) => b.getBoundingClientRect());
    if (!rects.length) return { top, bottom: top + section.offsetHeight, last: top };
    return {
      top: Math.min(...rects.map((r) => r.top)) + window.scrollY,
      bottom: Math.max(...rects.map((r) => r.bottom)) + window.scrollY,
      last: rects[rects.length - 1].top + window.scrollY,
    };
  };

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
    const reading = vh * SYNC.reading;
    maxScroll = Math.max(document.documentElement.scrollHeight - vh, 0);
    frames = [];
    for (const [id, def] of Object.entries(STATIONS)) {
      const el = document.getElementById(id);
      if (el) frames.push({ id, def, copy: copyOf(el, vh) });
    }
    if (!frames.length) return;

    // Moves happen while the gap between two stations' copy crosses the reading line.
    const moves = frames.slice(1).map((next, i) => {
      const leave = frames[i].copy.bottom - reading;
      const enter = next.copy.top - reading;
      const span = stationPose(frames[i], 1, legFrom).distanceTo(stationPose(next, 0, legTo));
      const half = Math.max(enter - leave, vh * SYNC.travel * clamp(span / SYNC.span, 0.8, 1.35)) / 2;
      let start = (leave + enter) / 2 - half;
      // Arrive at the pinned hall before it pins, and leave only once it lets go.
      if (next.copy.pin) start -= Math.max(start + half * 2 - next.copy.pin[0], 0);
      if (frames[i].copy.pin) start = Math.max(start, frames[i].copy.pin[1]);
      start = clamp(start, 0, maxScroll);
      return [start, Math.min(start + half * 2, maxScroll)];
    });
    // Very short stations: neighbouring moves meet in the middle rather than overlap.
    for (let i = 1; i < moves.length; i++) {
      if (moves[i][0] < moves[i - 1][1]) moves[i][0] = moves[i - 1][1] = (moves[i][0] + moves[i - 1][1]) / 2;
    }
    frames.forEach((f, i) => {
      f.a = i === 0 ? 0 : moves[i - 1][1];
      f.b = i === frames.length - 1 ? Math.max(maxScroll, f.a) : moves[i][0];
      // Works pushes in across its pin; a station with a second block of copy (Contact) holds
      // still until that block comes in, then pushes in with it.
      [f.u0, f.u1] = f.copy.pin ?? [Math.max(f.a, f.copy.last - vh), f.b];
    });
  };

  /** Camera position for a station at progress u (0..1). */
  const stationPose = (frame, u, out) => {
    const { def, id } = frame;
    const portrait = !wide && def.m;
    const pa = portrait ? def.m.a : def.a;
    const pb = portrait ? def.m.b : def.b;
    const k = smoothstep(u, 0, 1);
    const need = wide || portrait ? 0 : def.fit / (2 * fitScale);
    const dist = Math.max(lerp(pa.dist, pb.dist, k), need);
    let x = def.at[0];
    if (id === 'works') x = works.slabX(reduced() ? workIndex(u, works.count) : workFocus(u, works.count));
    if (wide) x += (def.shift ?? 0) + lerp(def.drift?.[0] ?? 0, def.drift?.[1] ?? 0, k);
    return out.set(x, lerp(pa.h, pb.h, k) + (wide || portrait ? 0 : 0.35), def.at[1] + dist);
  };

  const progress = (frame, scroll) => clamp((scroll - frame.u0) / Math.max(frame.u1 - frame.u0, 1), 0, 1);

  /** Where a scroll position falls: the station index, fractional while moving between two. */
  const stationAt = (scroll) => {
    let i = 0;
    while (i < frames.length - 1 && scroll >= frames[i].b) i++;
    if (i === 0 || scroll >= frames[i].a) return i;
    const prev = frames[i - 1];
    return i - 1 + ease(clamp((scroll - prev.b) / Math.max(frames[i].a - prev.b, 1), 0, 1));
  };

  // story.at: station index (fractional while travelling) · story.u: progress through that station
  const story = { at: 0, u: 0 };
  const from = new Vector3();

  /** Camera pose at a scroll position; also records where that is in the story. */
  const sample = (scroll, out) => {
    if (!frames.length) return out.set(0, 1.5, 9);
    story.at = stationAt(scroll);
    let i = Math.ceil(story.at);
    if (reduced()) {
      // No camera travel: cut half way through each move and hold still.
      i = Math.round(story.at);
      story.at = i;
      story.u = frames[i].id === 'works' ? progress(frames[i], scroll) : 0.5;
      return stationPose(frames[i], story.u, out);
    }
    if (story.at === i) {
      story.u = progress(frames[i], scroll);
      return stationPose(frames[i], story.u, out);
    }
    const prev = frames[i - 1];
    const e = story.at - (i - 1);
    stationPose(prev, 1, from);
    stationPose(frames[i], 0, out);
    out.lerpVectors(from, out, e);
    const lift = hump(e, prev.def.peak ?? 0.5);
    out.x += (prev.def.swing ?? 0) * lift;
    out.y += (prev.def.crane ?? 0) * lift;
    story.u = 0;
    return out;
  };

  // ---------- Follow: one softened scroll position drives the whole studio ----------
  let follow = null;
  let followVel = 0;
  let jump = null; // an in-page link far down the journey: { t, still, last }

  const advanceFollow = (dt, snap) => {
    const goal = window.scrollY;
    if (follow === null || snap) {
      follow = goal;
      followVel = 0;
      return;
    }
    if (jump) {
      // Hold still while the view dips to white, ride the page while hidden, and come back
      // once it has come to rest.
      jump.t += dt;
      if (jump.t < SYNC.dip) return;
      jump.still = goal === jump.last ? jump.still + dt : 0;
      jump.last = goal;
      follow = goal;
      followVel = 0;
      if (jump.still > 0.12 || jump.t > 2.5) {
        jump = null;
        container.classList.remove('is-dipping');
      }
      return;
    }
    [follow, followVel] = smoothDamp(follow, goal, followVel, SYNC.follow, dt);
    if (Math.abs(goal - follow) < 0.5 && Math.abs(followVel) < 1) {
      follow = goal;
      followVel = 0;
    }
  };
  const isFollowing = () => jump !== null || (follow !== null && Math.abs(window.scrollY - follow) > 0.5);

  const hashTarget = (hash) => {
    try {
      return hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    } catch {
      return null;
    }
  };
  /** The page is about to travel to `el`: if that is far down the journey, dip rather than race. */
  const jumpTo = (el) => {
    if (!el || reduced() || follow === null) return;
    const goal = clamp(el.getBoundingClientRect().top + window.scrollY, 0, maxScroll);
    if (Math.abs(stationAt(goal) - stationAt(follow)) < SYNC.jump) return;
    jump = { t: 0, still: 0, last: window.scrollY };
    container.classList.add('is-dipping', 'is-back');
  };
  const onLink = (event) => {
    const link = event.target.closest?.('a[href*="#"]');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.href, window.location.href);
    if (url.pathname === window.location.pathname) jumpTo(hashTarget(url.hash));
  };
  document.addEventListener('click', onLink);

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
  // Back from a case study (bfcache): the camera may still be inside its screen.
  const onPageShow = (event) => event.persisted && (flyTo = null);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('click', onClick);
  window.addEventListener('scroll', markInput, { passive: true });
  window.addEventListener('pageshow', onPageShow);

  const listeners = {
    'dimension:skill': (e) => instruments.highlight(e.detail.group, e.detail.item),
    'dimension:filter': (e) => instruments.filter(e.detail.group),
    'dimension:open-work': (e) => (flyTo = works.screenAnchor(e.detail.index).add(new Vector3(0, -0.1, 1.9))),
    'dimension:transmit': () => portal.pulse(),
    'dimension:skip-intro': () => (introT = 1),
    'dimension:overlay': (e) => (paused = e.detail.open),
    'dimension:settings': () => requestFrame(),
  };
  Object.entries(listeners).forEach(([name, fn]) => window.addEventListener(name, fn));

  // ---------- Frame ----------
  let introT = intro && !reduced() ? 0 : 1;
  let light = 1;
  let firstFrame = true;
  const pose = new Vector3();
  const ctx = { motion: true, camera, energy: 0, rise: 1, gallery: true, presence: 1, arrive: 1, leave: 0, u: 0 };

  const update = (dt) => {
    const motion = !reduced();
    if (introT < 1) introT = Math.min(1, introT + dt / 2.8);

    advanceFollow(dt, firstFrame || !motion || dt === 0);
    sample(follow, pose);
    if (motion) {
      pointerSmooth.x = damp(pointerSmooth.x, pointer.x, 1.1, dt);
      pointerSmooth.y = damp(pointerSmooth.y, pointer.y, 1.1, dt);
    } else {
      pointerSmooth.set(0, 0);
    }
    pose.x += pointerSmooth.x * 0.28;
    pose.y -= pointerSmooth.y * 0.12;

    // Intro: the camera starts low on the horizon and rises as the Core emerges.
    const introCam = 1 - smoothstep(introT, 0.35, 1);
    pose.y = lerp(pose.y, 0.55, introCam);
    pose.z += introCam * 1.4;

    // The camera rides the timeline directly (the follow already smooths it); only the flight
    // into a case study's screen eases on its own.
    if (flyTo && motion) {
      camPos.x = damp(camPos.x, flyTo.x, 4.5, dt);
      camPos.y = damp(camPos.y, flyTo.y, 4.5, dt);
      camPos.z = damp(camPos.z, flyTo.z, 4.5, dt);
    } else {
      camPos.copy(pose);
    }
    camera.position.copy(camPos);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld();

    // Light follows the station: how strongly the seam and shadows read, and the exposure.
    const i0 = Math.floor(story.at);
    const i1 = Math.min(i0 + 1, frames.length - 1);
    const f = story.at - i0;
    const d0 = frames[i0]?.def ?? STATIONS.home;
    const d1 = frames[i1]?.def ?? d0;
    light = lerp(d0.light, d1.light, f);
    renderer.toneMappingExposure = lerp(d0.exposure, d1.exposure, f);

    sky.position.copy(camPos);
    sky.material.uniforms.uIntensity.value = light;
    sky.material.uniforms.uReveal.value = smoothstep(introT, 0, 0.55);
    floor.mesh.position.set(camPos.x, 0, camPos.z);

    // Nearest shadow pools to the camera.
    for (const pool of pools) pool.d = (pool.p.x - camPos.x) ** 2 + (pool.p.z - camPos.z) ** 2;
    pools.sort((a, b) => a.d - b.d);
    for (let n = 0; n < POOLS && n < pools.length; n++) {
      const { p } = pools[n];
      floor.pools[n].set(p.x, p.z, p.r, p.strength * light);
    }

    // Core: touch response + intro rise. The floor ripples like liquid where it surfaces.
    const touching = motion && story.at < 0.6 ? hitCore() : null;
    if (touching) core.setPoint(touching);
    hoverCore = damp(hoverCore, touching ? 1 : 0, 6, dt);
    const breach = Math.max(introT - 0.2, 0) * 2.8;
    floor.ripple.set(0, 0, breach, introT < 1 ? 1 - smoothstep(introT, 0.55, 1) : 0);
    ctx.motion = motion;
    ctx.energy = hoverCore;
    ctx.rise = smoothstep(introT, 0.12, 0.8);
    ctx.gallery = gallery.matches;

    for (const [id, obj] of Object.entries(stationObjects)) {
      const k = frames.findIndex((fr) => fr.id === id);
      const near = k === -1 ? id === 'home' : Math.abs(story.at - k) < 1.6 || (id === 'origin' && story.at < 1.6);
      obj.group.visible = near;
      if (!near) continue;
      // arrive/leave: 0 → 1 over the moves in and out · u: its own progress (1 once it's behind you)
      ctx.arrive = k === -1 ? 1 : clamp(story.at - k + 1, 0, 1);
      ctx.leave = k === -1 ? 0 : clamp(story.at - k, 0, 1);
      ctx.u = story.at < k ? 0 : story.at > k ? 1 : story.u;
      // Architecture rises out of the floor as the camera approaches it.
      ctx.presence =
        id === 'origin' ? smoothstep(ctx.arrive, 0.02, 0.45) : id === 'works' ? smoothstep(ctx.arrive, 0.1, 0.85) : 1;
      obj.update(dt, ctx);
    }
    if (story.at > 1.4) works.load(renderer.capabilities.getMaxAnisotropy());
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
    // After 6s without input (and once the camera has settled), render at half rate to save power.
    const idle = now - lastInput > 6000 && introT >= 1 && !isFollowing();
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
  // A deep link (/#works) can still be scrolling into place as the studio opens: hide that trip too.
  jumpTo(hashTarget(window.location.hash));
  renderer.compileAsync(scene, camera).finally(() => {
    if (!document.hidden) start();
  });

  return {
    dispose() {
      stop();
      resizeObserver.disconnect();
      bodyObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('click', onLink);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', markInput);
      window.removeEventListener('pageshow', onPageShow);
      Object.entries(listeners).forEach(([name, fn]) => window.removeEventListener(name, fn));
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      [core, origin, instruments, works, portal].forEach((o) => o.dispose());
      sky.geometry.dispose();
      sky.material.dispose();
      floor.mesh.geometry.dispose();
      floor.mesh.material.dispose();
      fill.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      container.classList.remove('is-ready', 'is-dipping', 'is-back');
      canvas.remove();
    },
  };
}
