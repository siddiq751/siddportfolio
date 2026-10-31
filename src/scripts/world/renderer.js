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
  1: { dpr: 1.5, sphere: [96, 64], motes: 1400, shards: 48, dispersion: 0, transmissionScale: 0.5 },
  2: { dpr: 1.25, sphere: [144, 96], motes: 4000, shards: 90, dispersion: 0, transmissionScale: 0.75 },
  3: { dpr: 1.75, sphere: [192, 128], motes: 8000, shards: 140, dispersion: 0.22, transmissionScale: 1 },
};

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
  renderer.setClearColor(0x070808, 1);
  renderer.toneMapping = NeutralToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.transmissionResolutionScale = quality.transmissionScale;
  return renderer;
}

/**
 * The dimension's light, baked once into an environment map: a dark graded room,
 * a warm horizon band that wraps the world (every chrome surface reflects the horizon),
 * a warm key softbox and a cool verdigris rim.
 */
export function bakeEnvironment(renderer) {
  const scene = new Scene();

  const room = new SphereGeometry(30, 48, 24);
  const top = new Color(0x050606);
  const mid = new Color(0x0f1110);
  const floor = new Color(0x1a1c1b);
  const c = new Color();
  const colors = [];
  const pos = room.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 30;
    if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 0.5));
    else c.copy(mid).lerp(floor, Math.pow(-y, 0.6));
    colors.push(c.r, c.g, c.b);
  }
  room.setAttribute('color', new Float32BufferAttribute(colors, 3));
  scene.add(new Mesh(room, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  const emissive = (hex, intensity) => {
    const m = new MeshBasicMaterial({ side: DoubleSide });
    m.color.set(hex).multiplyScalar(intensity);
    return m;
  };

  const band = new Mesh(new CylinderGeometry(24, 24, 0.55, 128, 1, true), emissive(0xff8a3d, 7));
  scene.add(band);

  const softbox = (w, h, hex, intensity, x, y, z) => {
    const mesh = new Mesh(new PlaneGeometry(w, h), emissive(hex, intensity));
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  softbox(3.2, 9, 0xfff1e2, 7, -15, 7, 11); // warm key, front-left
  softbox(2, 9, 0x6fbfae, 3.2, 16, 3, -9); // cool rim, right
  softbox(18, 8, 0xece7dd, 0.8, 0, 22, 0); // soft top fill

  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return env;
}
