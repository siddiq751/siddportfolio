import {
  DirectionalLight,
  Group,
  LatheGeometry,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Sphere,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  createPerformanceGuard,
  createRadialTexture,
  createRenderLoop,
  createRenderer,
  createStudioEnvironment,
} from './three/studio.js';
import { finePointerQuery, prefersReducedMotion, reducedMotionQuery } from './utils.js';

const { damp, clamp } = MathUtils;

// Composition layout (world units)
const SPHERE_RADIUS = 1;
const ORBIT_A = 1.62;
const ORBIT_B = 1.98;
const PLATFORM_RADIUS = 2.1;
const PLATFORM_HEIGHT = 0.26;
const PLATFORM_Y = -1.42;
const GROUND_Y = -2.1;
const TARGET = new Vector3(0, -0.5, 0);
const FRAME = { width: 5.2, height: 4.7 };

/** Disc with a fully rounded rim, turned on a lathe. */
function createPlatformGeometry(radius, height, segments) {
  const r = height / 2;
  const points = [new Vector2(0, -r), new Vector2(radius - r, -r)];
  for (let i = 1; i <= 16; i++) {
    const angle = -Math.PI / 2 + (i / 16) * Math.PI;
    points.push(new Vector2(radius - r + Math.cos(angle) * r, Math.sin(angle) * r));
  }
  points.push(new Vector2(0, r));
  return new LatheGeometry(points, segments);
}

export function mountHero(container) {
  const compact = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'hero__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = createRenderer(canvas, { alpha: true, maxPixelRatio: compact ? 1.5 : 1.75 });
  } catch (error) {
    console.warn('WebGL renderer could not be created:', error);
    return null;
  }
  container.append(canvas);

  const scene = new Scene();
  scene.environment = createStudioEnvironment(renderer, { mood: 'light' });

  const camera = new PerspectiveCamera(28, 1, 0.1, 60);

  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-4, 6, 5);
  scene.add(key);

  // ----- Materials -----
  const blackChrome = new MeshPhysicalMaterial({
    color: 0x2a2a2d,
    metalness: 1,
    roughness: 0.09,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.6,
  });
  const pearl = new MeshPhysicalMaterial({
    color: 0xf4f2ed,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    sheen: 0.5,
    sheenRoughness: 0.45,
    sheenColor: 0xffffff,
    iridescence: 0.3,
    iridescenceIOR: 1.3,
  });
  const chrome = new MeshPhysicalMaterial({ color: 0xdedede, metalness: 1, roughness: 0.14, envMapIntensity: 1.15 });
  const ceramic = new MeshPhysicalMaterial({
    color: 0xececea,
    roughness: 0.45,
    clearcoat: 0.45,
    clearcoatRoughness: 0.32,
  });

  const detail = compact
    ? { sphere: [72, 48], ring: [10, 160], lathe: 96 }
    : { sphere: [112, 80], ring: [14, 260], lathe: 160 };

  // ----- Composition -----
  const root = new Group();
  scene.add(root);

  const floating = new Group();
  root.add(floating);

  const sphere = new Mesh(new SphereGeometry(SPHERE_RADIUS, ...detail.sphere), blackChrome);
  floating.add(sphere);

  // Orbit A carries the pearl; orbit B is wider and crosses it.
  const precessA = new Group();
  const tiltA = new Group();
  tiltA.rotation.set(0.36, 0, -0.2);
  precessA.add(tiltA);
  const ringA = new Mesh(new TorusGeometry(ORBIT_A, 0.0115, ...detail.ring), chrome);
  ringA.rotation.x = Math.PI / 2;
  tiltA.add(ringA);
  const pearlMesh = new Mesh(new SphereGeometry(0.25, 64, 48), pearl);
  tiltA.add(pearlMesh);

  const precessB = new Group();
  const tiltB = new Group();
  tiltB.rotation.set(-0.52, 0, 0.44);
  precessB.add(tiltB);
  const ringB = new Mesh(new TorusGeometry(ORBIT_B, 0.007, ...detail.ring), chrome);
  ringB.rotation.x = Math.PI / 2;
  tiltB.add(ringB);
  const bead = new Mesh(new SphereGeometry(0.055, 24, 16), chrome);
  tiltB.add(bead);

  floating.add(precessA, precessB);

  const platform = new Group();
  platform.position.y = PLATFORM_Y;
  root.add(platform);
  platform.add(new Mesh(createPlatformGeometry(PLATFORM_RADIUS, PLATFORM_HEIGHT, detail.lathe), ceramic));
  const trim = new Mesh(new TorusGeometry(PLATFORM_RADIUS + 0.002, 0.012, 10, detail.ring[1]), chrome);
  trim.rotation.x = Math.PI / 2;
  platform.add(trim);

  // Baked soft shadows instead of shadow maps.
  const radial = createRadialTexture();
  const shadowMaterial = (opacity) =>
    new MeshBasicMaterial({ color: 0x000000, map: radial, transparent: true, depthWrite: false, opacity, toneMapped: false });

  const contactShadow = new Mesh(new PlaneGeometry(2.3, 2.3), shadowMaterial(0.5));
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = PLATFORM_HEIGHT / 2 + 0.002;
  platform.add(contactShadow);

  const groundShadow = new Mesh(new PlaneGeometry(4.6, 4.6), shadowMaterial(0.16));
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = GROUND_Y;
  root.add(groundShadow);

  // ----- Interaction state -----
  const state = {
    pointer: new Vector2(), // -1..1 across the viewport
    pointerSmooth: new Vector2(),
    canvasPointer: new Vector2(10, 10), // NDC within the canvas (10 = outside)
    hover: 0,
    drag: 0,
    dragVelocity: 0,
    dragging: false,
    lastX: 0,
    scroll: 0,
    scrollSmooth: 0,
    pearlAngle: 0.2,
    beadAngle: 2.6,
    time: 0,
    distance: 12,
  };

  const raycaster = new Raycaster();
  const hitSphere = new Sphere(new Vector3(), SPHERE_RADIUS * 1.05);
  const hero = container.closest('[data-hero]') || container;

  const onPointerMove = (event) => {
    if (event.pointerType === 'mouse' && finePointerQuery.matches) {
      state.pointer.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
      const rect = canvas.getBoundingClientRect();
      state.canvasPointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    }
    if (state.dragging) {
      const dx = event.clientX - state.lastX;
      state.lastX = event.clientX;
      state.dragVelocity = dx * 0.0055;
      state.drag = clamp(state.drag + dx * 0.0055, -1.3, 1.3);
    }
  };

  const endDrag = () => {
    state.dragging = false;
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (prefersReducedMotion()) return;
    state.dragging = true;
    state.lastX = event.clientX;
    state.dragVelocity = 0;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => state.canvasPointer.set(10, 10));
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  const readScroll = () => {
    state.scroll = clamp(window.scrollY / Math.max(hero.offsetHeight, 1), 0, 1);
  };
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  // ----- Layout -----
  const fit = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const halfTan = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    state.distance = Math.max(FRAME.height / 2 / halfTan, FRAME.width / 2 / (halfTan * camera.aspect));
    camera.updateProjectionMatrix();
  };

  // ----- Per-frame update -----
  const update = (dt) => {
    const motion = !prefersReducedMotion();
    if (motion) state.time += dt;
    const t = state.time;

    state.pointerSmooth.x = damp(state.pointerSmooth.x, motion ? state.pointer.x : 0, 2.6, dt);
    state.pointerSmooth.y = damp(state.pointerSmooth.y, motion ? state.pointer.y : 0, 2.6, dt);
    state.scrollSmooth = damp(state.scrollSmooth, motion ? state.scroll : 0, 5, dt);

    if (!state.dragging) {
      state.drag += state.dragVelocity;
      state.dragVelocity *= 0.9;
      state.drag = damp(state.drag, 0, 0.9, dt);
    }

    // Camera orbits subtly with the cursor, drag and scroll; reflections shift with it.
    const s = state.scrollSmooth;
    const azimuth = state.pointerSmooth.x * 0.2 + state.drag + s * 0.55;
    const elevation = 0.2 - state.pointerSmooth.y * 0.07 + s * 0.2;
    const d = state.distance * (1 + s * 0.06);
    camera.position.set(
      TARGET.x + d * Math.sin(azimuth) * Math.cos(elevation),
      TARGET.y + d * Math.sin(elevation),
      TARGET.z + d * Math.cos(azimuth) * Math.cos(elevation),
    );
    camera.lookAt(TARGET);

    // Hovering the black sphere quickens the orbits a little.
    camera.updateMatrixWorld();
    raycaster.setFromCamera(state.canvasPointer, camera);
    sphere.getWorldPosition(hitSphere.center);
    const hovering = motion && Math.abs(state.canvasPointer.x) <= 1 && raycaster.ray.intersectsSphere(hitSphere);
    state.hover = damp(state.hover, hovering ? 1 : 0, 4, dt);
    const energy = state.hover;

    if (motion) {
      state.pearlAngle += dt * 0.34 * (1 + energy * 1.6);
      state.beadAngle -= dt * 0.2 * (1 + energy * 1.2);
      precessA.rotation.y += dt * 0.07;
      precessB.rotation.y -= dt * 0.05;
    }

    pearlMesh.position.set(Math.cos(state.pearlAngle) * ORBIT_A, 0, Math.sin(state.pearlAngle) * ORBIT_A);
    bead.position.set(Math.cos(state.beadAngle) * ORBIT_B, 0, Math.sin(state.beadAngle) * ORBIT_B);

    tiltA.rotation.x = 0.36 + s * 0.3 + energy * 0.06;
    tiltB.rotation.x = -0.52 - s * 0.22 - energy * 0.05;

    const bob = Math.sin(t * 0.9) * 0.055;
    floating.position.y = bob;
    platform.position.y = PLATFORM_Y + Math.sin(t * 0.9 - 0.8) * 0.025;
    sphere.scale.setScalar(1 + energy * 0.025);
    root.position.y = s * 0.45;

    // Contact shadow tightens as the sphere sinks towards the platform.
    const gap = floating.position.y - SPHERE_RADIUS - (platform.position.y + PLATFORM_HEIGHT / 2);
    const closeness = clamp(1 - (gap - 0.2) / 0.2, 0, 1);
    contactShadow.material.opacity = 0.38 + closeness * 0.16;
    contactShadow.scale.setScalar(1.06 - closeness * 0.08);
  };

  const render = () => renderer.render(scene, camera);
  let loop = null;

  // Static frames for reduced motion, resizes and paused states.
  const renderStill = () => {
    if (!loop || loop.running) return;
    update(0);
    render();
  };

  new ResizeObserver(() => {
    fit();
    renderStill();
  }).observe(container);
  reducedMotionQuery.addEventListener('change', renderStill);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    loop?.stop();
    container.classList.remove('is-ready');
  });

  // Compile shaders off the critical path, then start rendering and fade in.
  fit();
  update(0);
  const start = () => {
    const guard = createPerformanceGuard(renderer, fit);
    loop = createRenderLoop(container, (dt) => {
      update(dt);
      render();
      guard(dt);
    });
    render();
    container.classList.add('is-ready');
  };
  renderer.compileAsync(scene, camera).then(start, start);

  return { renderer, scene, camera };
}
