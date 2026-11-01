import {
  BackSide,
  Color,
  CylinderGeometry,
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

export const QUALITY = {
  1: { dpr: 1.5, sphere: [96, 64], shards: 48, dispersion: 0, transmissionScale: 0.5 },
  2: { dpr: 1.25, sphere: [144, 96], shards: 90, dispersion: 0, transmissionScale: 0.75 },
  3: { dpr: 1.75, sphere: [192, 128], shards: 140, dispersion: 0.22, transmissionScale: 1 },
};

/** The studio's paper colour; also the clear colour behind everything. */
export const STUDIO = 0xf3f3f3;

/** Throws if WebGL 2 is unavailable — the caller keeps the CSS still. */
export function createRenderer(canvas, quality) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
  renderer.setClearColor(STUDIO, 1);
  // Khronos PBR Neutral: built for product renders — whites stay white, chrome keeps its hue.
  renderer.toneMapping = NeutralToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.transmissionResolutionScale = quality.transmissionScale;
  // The Core and its reflection are cut at the floor plane (see core.js).
  renderer.localClippingEnabled = true;
  return renderer;
}

/**
 * The studio's light, baked once into an environment map. It is what every chrome surface
 * reflects: a white sweep, a graphite horizon band (the line chrome needs to read as chrome),
 * an overhead softbox, two tall strip lights and black flags that carve the silhouettes.
 */
export function bakeEnvironment(renderer) {
  const scene = new Scene();

  const room = new SphereGeometry(30, 64, 32);
  const zenith = new Color(0x7c7e81);
  const horizon = new Color(0xd2d2d2);
  const floor = new Color(0xa9a9a9);
  const nadir = new Color(0xf6f6f6);
  const c = new Color();
  const colors = [];
  const pos = room.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 30;
    if (y > 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.7));
    else c.copy(floor).lerp(nadir, Math.pow(-y, 0.45));
    colors.push(c.r, c.g, c.b);
  }
  room.setAttribute('color', new Float32BufferAttribute(colors, 3));
  scene.add(new Mesh(room, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  const panel = (hex, intensity) => {
    const m = new MeshBasicMaterial({ side: DoubleSide });
    m.color.set(hex).multiplyScalar(intensity);
    return m;
  };

  // The horizon, as chrome sees it: a thin graphite band all the way round.
  const band = new Mesh(new CylinderGeometry(24, 24, 1.1, 128, 1, true), panel(0x202020, 1));
  band.position.y = 0.7;
  scene.add(band);

  const place = (w, h, material, x, y, z) => {
    const mesh = new Mesh(new PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  // Asymmetric, like a real product set: big key upper-left, a tall rim strip right,
  // one black flag carving the left rim, a long overhead strip for the crown.
  place(10, 8, panel(0xffffff, 4.2), -11, 11, 9); // key softbox, upper front-left
  place(1.6, 16, panel(0xffffff, 5.5), 16, 4, -5); // rim strip, right
  place(26, 3.2, panel(0xffffff, 2.6), 0, 20, -4); // overhead strip
  place(8, 18, panel(0x0a0a0a, 1), -17, 3, -9); // black flag, back-left
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.015).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return env;
}
