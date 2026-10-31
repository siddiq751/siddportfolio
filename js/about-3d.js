import {
  AdditiveBlending,
  CanvasTexture,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  createPerformanceGuard,
  createRadialTexture,
  createRenderLoop,
  createRenderer,
  createStudioEnvironment,
} from './three/studio.js';
import { finePointerQuery, prefersReducedMotion, reducedMotionQuery } from './utils.js';

const { damp, clamp } = MathUtils;

const CUBE_SIZE = 1.45;
const CUBE_REACH = (CUBE_SIZE * Math.sqrt(3)) / 2; // centre to corner
const TARGET = new Vector3(0, 0.15, 0);
const FRAME = { width: 4.6, height: 4.9 };
const BACKGROUND = 0x101010;

function createBackdropTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#4a4a48');
  gradient.addColorStop(0.3, '#2a2a29');
  gradient.addColorStop(0.62, '#161616');
  gradient.addColorStop(0.85, '#101010');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * About-section sculpture: a frosted glass cube balanced on one corner,
 * circled by a chrome ring, with a pearl hovering over its top vertex.
 */
export function mountAbout(container) {
  const compact = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'about__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = createRenderer(canvas, { alpha: false, maxPixelRatio: compact ? 1.5 : 1.75 });
  } catch (error) {
    console.warn('WebGL renderer could not be created:', error);
    return null;
  }
  renderer.setClearColor(BACKGROUND, 1);
  if (compact) renderer.transmissionResolutionScale = 0.6;
  container.append(canvas);

  const scene = new Scene();
  scene.environment = createStudioEnvironment(renderer, { mood: 'dark' });

  const camera = new PerspectiveCamera(26, 1, 0.1, 60);

  const key = new DirectionalLight(0xffffff, 1.2);
  key.position.set(-3, 5, 4);
  scene.add(key);

  const glass = new MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.1,
    transmission: 1,
    thickness: 1.1,
    ior: 1.5,
    attenuationColor: 0xeef1f5,
    attenuationDistance: 6,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.3,
  });
  const chrome = new MeshPhysicalMaterial({ color: 0xe2e2e2, metalness: 1, roughness: 0.12, envMapIntensity: 1.2 });
  const pearl = new MeshPhysicalMaterial({
    color: 0xf2f0eb,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    sheen: 0.5,
    sheenColor: 0xffffff,
    iridescence: 0.3,
    iridescenceIOR: 1.3,
  });

  const root = new Group();
  scene.add(root);

  // Cube balanced on a corner: rotate its (1,1,1) diagonal onto the Y axis.
  const spin = new Group();
  root.add(spin);
  const cube = new Mesh(new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, compact ? 4 : 6, 0.14), glass);
  cube.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(1, 1, 1).normalize(), new Vector3(0, 1, 0)));
  spin.add(cube);

  const ringPivot = new Group();
  ringPivot.rotation.set(1.18, 0, 0.32);
  root.add(ringPivot);
  const ring = new Mesh(new TorusGeometry(1.6, 0.042, compact ? 16 : 24, compact ? 160 : 240), chrome);
  ringPivot.add(ring);

  const pearlMesh = new Mesh(new SphereGeometry(0.24, 64, 48), pearl);
  root.add(pearlMesh);

  // Opaque backdrop with a soft lit centre: it fades exactly into the section
  // colour and gives the glass something luminous to refract.
  const backdrop = new Mesh(
    new PlaneGeometry(6.4, 6.4),
    new MeshBasicMaterial({ map: createBackdropTexture(), toneMapped: false }),
  );
  backdrop.position.set(0, 0.2, -3.2);
  scene.add(backdrop);

  const glow = new Mesh(
    new PlaneGeometry(3.6, 3.6),
    new MeshBasicMaterial({
      map: createRadialTexture(),
      transparent: true,
      opacity: 0.07,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -CUBE_REACH - 0.35;
  root.add(glow);

  const state = {
    pointer: new Vector2(),
    pointerSmooth: new Vector2(),
    scroll: 0,
    scrollSmooth: 0,
    time: 0,
    distance: 12,
  };

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse' || !finePointerQuery.matches) return;
      state.pointer.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true },
  );

  // Progress of the visual through the viewport: 0 entering, 1 leaving.
  const readScroll = () => {
    const rect = container.getBoundingClientRect();
    state.scroll = clamp(1 - (rect.top + rect.height) / (window.innerHeight + rect.height), 0, 1);
  };
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

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

  const update = (dt) => {
    const motion = !prefersReducedMotion();
    if (motion) state.time += dt;
    const t = state.time;

    state.pointerSmooth.x = damp(state.pointerSmooth.x, motion ? state.pointer.x : 0, 2.2, dt);
    state.pointerSmooth.y = damp(state.pointerSmooth.y, motion ? state.pointer.y : 0, 2.2, dt);
    state.scrollSmooth = damp(state.scrollSmooth, motion ? state.scroll : 0.5, 4, dt);

    const azimuth = 0.35 + state.pointerSmooth.x * 0.22;
    const elevation = 0.16 - state.pointerSmooth.y * 0.08;
    const d = state.distance;
    camera.position.set(
      TARGET.x + d * Math.sin(azimuth) * Math.cos(elevation),
      TARGET.y + d * Math.sin(elevation),
      TARGET.z + d * Math.cos(azimuth) * Math.cos(elevation),
    );
    camera.lookAt(TARGET);
    backdrop.quaternion.copy(camera.quaternion);

    spin.rotation.y = 0.5 + t * 0.16 + (state.scrollSmooth - 0.5) * 1.2;
    ringPivot.rotation.z = 0.32 + Math.sin(t * 0.35) * 0.12;
    ringPivot.rotation.y = t * 0.12;
    pearlMesh.position.set(0, CUBE_REACH + 0.5 + Math.sin(t * 1.1) * 0.06, 0);
  };

  const render = () => renderer.render(scene, camera);
  let loop = null;

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
