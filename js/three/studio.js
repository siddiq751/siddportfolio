import {
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { prefersReducedMotion, reducedMotionQuery } from '../utils.js';

/** Throws if a WebGL 2 context can't be created — callers keep their fallback. */
export function createRenderer(canvas, { alpha = true, maxPixelRatio = 2 } = {}) {
  const renderer = new WebGLRenderer({
    canvas,
    alpha,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.toneMapping = NeutralToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  return renderer;
}

/**
 * A photographic "studio" baked once into a PMREM environment map:
 * a graded room plus emissive softboxes. Chrome and glass get crisp strip
 * reflections without any texture downloads or real-time reflection passes.
 */
export function createStudioEnvironment(renderer, { mood = 'light' } = {}) {
  const light = mood === 'light';
  const scene = new Scene();

  // Room with a vertical gradient: a bright floor (mirrors the page) and a darker ceiling.
  const room = new SphereGeometry(20, 48, 24);
  const top = new Color(light ? 0x2c2c2c : 0x040404);
  const horizon = new Color(light ? 0x7d7d7b : 0x0e0e0e);
  const floor = new Color(light ? 0xeeeeeb : 0x1c1c1c);
  const color = new Color();
  const colors = [];
  const positions = room.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i) / 20;
    if (y > 0) color.copy(horizon).lerp(top, Math.pow(y, 0.55));
    else color.copy(horizon).lerp(floor, Math.pow(-y, 0.45));
    colors.push(color.r, color.g, color.b);
  }
  room.setAttribute('color', new Float32BufferAttribute(colors, 3));
  scene.add(new Mesh(room, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  const softbox = (width, height, intensity, x, y, z) => {
    const material = new MeshBasicMaterial({ side: DoubleSide });
    material.color.setScalar(intensity);
    const mesh = new Mesh(new PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };

  softbox(9, 4.5, light ? 5 : 3.2, 0, 12, 3); // overhead key
  softbox(2.4, 11, light ? 11 : 8, -11, 1.5, 7); // tall strip, front-left
  softbox(1.4, 11, light ? 7 : 10, 11.5, 1, -2); // rim strip, right
  softbox(14, 3, light ? 1.6 : 1.2, 0, 2.5, -15); // back wash

  const pmrem = new PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  scene.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  return envMap;
}

/** Radial falloff used for baked contact shadows and soft glows. */
export function createRadialTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * rAF loop that only runs while its element is on screen, the tab is
 * visible and the user hasn't asked for reduced motion.
 * `element.dataset.render` reports the state: running | paused | static.
 */
export function createRenderLoop(element, onFrame) {
  let frameId = 0;
  let last = 0;
  let running = false;
  let inView = false;

  const tick = (now) => {
    frameId = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    onFrame(dt);
  };

  const sync = () => {
    const shouldRun = inView && !document.hidden && !prefersReducedMotion();
    element.dataset.render = shouldRun ? 'running' : prefersReducedMotion() ? 'static' : 'paused';
    if (shouldRun === running) return;
    running = shouldRun;
    if (running) {
      last = performance.now();
      frameId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameId);
    }
  };

  const observer = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      sync();
    },
    { rootMargin: '80px 0px' },
  );
  observer.observe(element);
  document.addEventListener('visibilitychange', sync);
  reducedMotionQuery.addEventListener('change', sync);

  return {
    get running() {
      return running;
    },
    stop() {
      inView = false;
      observer.disconnect();
      sync();
    },
  };
}

/**
 * Lowers the pixel ratio once if the first couple of seconds render slowly,
 * so weaker GPUs keep a smooth frame rate.
 */
export function createPerformanceGuard(renderer, onChange) {
  let frames = 0;
  let total = 0;
  let adjusted = false;
  return (dt) => {
    if (adjusted) return;
    frames++;
    total += dt;
    if (frames < 90) return;
    const average = total / frames;
    adjusted = true;
    if (average > 1 / 38 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.7));
      onChange();
    }
  };
}
