import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HASH, VALUE_NOISE, srgb } from './glsl.js';
import { workFocus, workIndex } from '../../lib/works-track.js';

const { damp, lerp, smoothstep } = MathUtils;

/**
 * Light for matte surfaces (stone, ceramic): a soft hemisphere fill that keeps white objects
 * white, plus one key from the upper left — the same side as the key softbox in the
 * environment — so planes turn and edges read. Metals mostly see the environment map.
 */
export function createStudioFill() {
  const rig = new Group();
  const key = new DirectionalLight(0xffffff, 0.9);
  key.position.set(-5, 9, 6);
  rig.add(new HemisphereLight(0xffffff, 0xe2e2e2, 1.15), key);
  rig.dispose = () => key.dispose();
  return rig;
}

/** Procedural white travertine: faint vertical strata and pores, no textures. */
function createStone(color = 0xf1f0ee, envMapIntensity = 0.35) {
  const m = new MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, envMapIntensity });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStone;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvStone = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vStone;\n${HASH}\n${VALUE_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float strata = vnoise(vec2(vStone.y * 3.2, vStone.x * 0.35 + vStone.z * 0.35)) * 0.6 + vnoise(vStone.xy * vec2(1.4, 9.0) + vStone.z) * 0.4;
        float pores = smoothstep(0.84, 0.9, vnoise(vStone.xy * 14.0 + vStone.zx * 14.0));
        diffuseColor.rgb *= (0.955 + strata * 0.06) * (1.0 - pores * 0.08);`,
      );
  };
  m.customProgramCacheKey = () => 'white-stone';
  return m;
}

const chrome = () => new MeshPhysicalMaterial({ color: 0xe4e4e4, metalness: 1, roughness: 0.04, envMapIntensity: 1 });
const aluminium = () =>
  new MeshPhysicalMaterial({ color: 0xcdcdcd, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
const ceramic = () =>
  new MeshPhysicalMaterial({
    color: 0xfafafa,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1,
  });
const graphite = () =>
  new MeshPhysicalMaterial({ color: 0x2a2a2a, metalness: 1, roughness: 0.28, envMapIntensity: 0.9 });

/** The mark printed in fine graphite lines, for the glass plaque. */
function markTexture() {
  const s = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(17,17,17,0.62)';
  ctx.lineWidth = 2;
  for (const r of [132, 104]) {
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.44, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(17,17,17,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.12, s * 0.78);
  ctx.lineTo(s * 0.88, s * 0.78);
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* ------------------------------------------------------------------------ */

export function createOrigin(quality) {
  const group = new Group();
  // Matte stone barely mirrors the studio, so the horizon band never smears across it.
  const stone = createStone(0xf3f2f0);
  const polished = chrome();
  const disposables = [stone, polished];

  // The gateway: two white monoliths with a slit lined in polished chrome; the camera passes
  // through it. The slit is wide enough that the walls drift past rather than whip past.
  const SLIT_Z = -15;
  const HALF = 1.35; // half the slit's width
  const PILLAR_X = HALF + 1.7;
  const left = new Mesh(new BoxGeometry(3.4, 7.6, 1.3), stone);
  left.position.set(-PILLAR_X, 3.8, SLIT_Z);
  const right = left.clone();
  right.position.x = PILLAR_X;
  const lintel = new Mesh(new BoxGeometry(HALF * 2, 1.3, 1.3), stone);
  lintel.position.set(0, 6.95, SLIT_Z);
  const arch = new Group();
  const reveal = new BoxGeometry(0.05, 6.3, 1.32);
  for (const x of [-HALF + 0.02, HALF - 0.02]) {
    const strip = new Mesh(reveal, polished);
    strip.position.set(x, 3.15, SLIT_Z);
    arch.add(strip);
  }
  arch.add(left, right, lintel);
  group.add(arch);

  // The room: a glass plaque carrying the mark, on a white plinth, with a chrome seed above.
  const ROOM = new Vector3(0, 0, -30);
  const slabGroup = new Group();
  slabGroup.position.set(ROOM.x, 0, ROOM.z);
  slabGroup.rotation.y = -0.2;
  // Low-iron float glass: water-clear, only a breath of cool tint.
  const glass = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 0.35,
    ior: 1.52,
    dispersion: quality.dispersion,
    attenuationColor: new Color(0xeef3f2),
    attenuationDistance: 4,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity: 1.5,
  });
  const slab = new Mesh(new RoundedBoxGeometry(2.5, 3.3, 0.16, 4, 0.05), glass);
  slab.position.y = 1.99;
  // Two chrome clamps hold the glass in the plinth.
  const clampGeo = new RoundedBoxGeometry(0.3, 0.24, 0.32, 2, 0.035);
  for (const x of [-0.82, 0.82]) {
    const clamp = new Mesh(clampGeo, polished);
    clamp.position.set(x, 0.47, 0);
    slabGroup.add(clamp);
  }
  const markTex = markTexture();
  const markMat = new MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false });
  const mark = new Mesh(new PlaneGeometry(2.1, 2.1), markMat);
  mark.position.set(0, 2.06, 0.085);
  const plinth = new Mesh(new BoxGeometry(3.3, 0.36, 0.95), stone);
  plinth.position.y = 0.18;
  slabGroup.add(slab, mark, plinth);
  disposables.push(glass, markTex, markMat);

  const seedMat = chrome();
  const seed = new Mesh(new SphereGeometry(0.2, 48, 32), seedMat);
  disposables.push(seedMat);
  group.add(slabGroup, seed);

  let time = 0;
  return {
    group,
    slitZ: SLIT_Z,
    pools: [
      { x: -PILLAR_X, z: SLIT_Z + 0.9, r: 2.6, strength: 0.22 },
      { x: PILLAR_X, z: SLIT_Z + 0.9, r: 2.6, strength: 0.22 },
      { x: ROOM.x, z: ROOM.z + 0.3, r: 1.9, strength: 0.3 },
    ],
    update(dt, { motion, presence = 1 }) {
      if (motion) time += dt;
      // The monoliths rise out of the floor as the journey begins.
      arch.scale.y = Math.max(presence, 0.001);
      arch.visible = presence > 0.002;
      seed.position.set(ROOM.x, 4.08 + (motion ? Math.sin(time * 0.7) * 0.08 : 0), ROOM.z);
    },
    dispose() {
      group.traverse((o) => o.isMesh && o.geometry.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}

/* ------------------------------------------------------------------------ */

export function createInstruments(quality, skillGroups) {
  const CENTER = new Vector3(0, 2.15, -52);
  const group = new Group();
  group.position.copy(CENTER);
  // One material per skill group: mirror chrome, satin aluminium, white ceramic.
  const materials = [chrome(), aluminium(), ceramic()];
  const shardGeo = new OctahedronGeometry(0.16, 0);
  const radii = [1.2, 1.8, 2.4];
  const tilts = [
    [1.25, 0, 0.18],
    [1.05, 0.4, -0.3],
    [1.4, -0.3, 0.42],
  ];

  const bands = skillGroups.map((items, gi) => {
    const band = new Group();
    band.rotation.set(...tilts[gi % tilts.length]);
    const spin = new Group();
    band.add(spin);
    const shards = items.map((_, ii) => {
      const mesh = new Mesh(shardGeo, materials[gi % materials.length]);
      const a = (ii / items.length) * Math.PI * 2;
      mesh.position.set(Math.cos(a) * radii[gi], Math.sin(a) * radii[gi], 0);
      mesh.rotation.set(a, a * 0.5, 0);
      spin.add(mesh);
      return mesh;
    });
    group.add(band);
    return { band, spin, shards, scale: 1, speed: 0.07 + gi * 0.03, twist: band.rotation.z };
  });

  // Fine chrome dust along the orbits.
  const dustGeo = new TetrahedronGeometry(0.04, 0);
  const dust = new InstancedMesh(dustGeo, materials[0], quality.shards);
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  for (let i = 0; i < quality.shards; i++) {
    const gi = i % radii.length;
    const a = Math.random() * Math.PI * 2;
    const r = radii[gi] + (Math.random() - 0.5) * 0.35;
    p.set(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.3).applyEuler(
      bands[gi]?.band.rotation ?? group.rotation,
    );
    q.setFromAxisAngle(new Vector3(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6);
    s.setScalar(0.5 + Math.random());
    dust.setMatrixAt(i, m.compose(p, q, s));
  }
  group.add(dust);

  const heartMat = chrome();
  const heart = new Mesh(new SphereGeometry(0.34, 64, 48), heartMat);
  group.add(heart);

  const active = { group: null, item: null, filter: null };
  let pulse = 1;

  return {
    group,
    pools: [{ x: CENTER.x, z: CENTER.z, r: 2.4, strength: 0.16 }],
    highlight(g, i) {
      active.group = g;
      active.item = i;
    },
    filter(g) {
      active.filter = g;
    },
    /** arrive: 0 → 1 over the camera's move in. The orbits open around the heart as it lands,
     *  one skill group after another, in the order the columns read. */
    update(dt, { motion, arrive = 1 }) {
      let opened = 0;
      bands.forEach((b, gi) => {
        if (motion) b.spin.rotation.z += dt * b.speed;
        const open = smoothstep(arrive, 0.4 + gi * 0.12, 0.76 + gi * 0.12);
        opened += open / bands.length;
        const target = active.filter === null ? 1 : active.filter === gi ? 1.1 : 0.78;
        b.scale = damp(b.scale, target, 4, dt || 1);
        b.band.scale.setScalar(b.scale * lerp(0.16, 1, open));
        b.band.rotation.z = b.twist + (1 - open) * 1.3;
        b.shards.forEach((mesh, ii) => {
          const on = active.group === gi && active.item === ii;
          const k = damp(mesh.scale.x, on ? 2.1 : 1, 6, dt || 1);
          mesh.scale.setScalar(k);
          if (motion) mesh.rotation.y += dt * (on ? 1 : 0.22);
        });
      });
      if (motion) dust.rotation.z += dt * 0.012;
      dust.scale.setScalar(lerp(0.16, 1, opened));
      // The heart swells a little while a skill is in focus.
      pulse = damp(pulse, active.group === null ? 1 : 1.14, 5, dt || 1);
      heart.scale.setScalar(pulse);
    },
    dispose() {
      shardGeo.dispose();
      dustGeo.dispose();
      dust.dispose();
      heart.geometry.dispose();
      heartMat.dispose();
      materials.forEach((mat) => mat.dispose());
    },
  };
}

/* ------------------------------------------------------------------------ */

export const WORKS_Z = -78;
export const WORKS_SPACING = 8;

export function createWorks(images) {
  const group = new Group();
  // Each work is shown on a white satin panel with a lacquered face, like a studio display.
  const panelMat = new MeshPhysicalMaterial({
    color: 0xf6f6f6,
    roughness: 0.5,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.9,
  });
  const bezelGeo = new PlaneGeometry(3.66, 2.34);
  const polished = chrome();
  const slabGeo = new RoundedBoxGeometry(4.1, 4.4, 0.3, 4, 0.06);
  const screenGeo = new PlaneGeometry(3.52, 2.2);
  const barGeo = new BoxGeometry(3.52, 0.022, 0.03);
  const loader = new TextureLoader();
  let loaded = false;

  const slabs = images.map((src, i) => {
    const x = i * WORKS_SPACING;
    const holder = new Group();
    holder.position.set(x, 0, WORKS_Z);
    const slab = new Mesh(slabGeo, panelMat);
    slab.position.y = 2.2;
    // Screens fade into the stone when they're not the one on show.
    const screenMat = new MeshBasicMaterial({ color: 0xe9e9e9, toneMapped: false, transparent: true });
    const screen = new Mesh(screenGeo, screenMat);
    screen.position.set(0, 2.55, 0.158);
    // A black glass bezel; it fades with the screen so idle works never read as dark holes.
    const bezelMat = new MeshBasicMaterial({ color: 0x161617, transparent: true, depthWrite: false });
    const bezel = new Mesh(bezelGeo, bezelMat);
    bezel.position.set(0, 2.55, 0.153);
    const bar = new Mesh(barGeo, polished);
    bar.position.set(0, 2.55 - 1.27, 0.165);
    holder.add(slab, bezel, screen, bar);
    group.add(holder);
    return { holder, screen, screenMat, bezelMat, src };
  });

  return {
    group,
    count: slabs.length,
    slabX: (i) => i * WORKS_SPACING,
    screenAnchor: (i) => new Vector3(i * WORKS_SPACING, 2.55, WORKS_Z + 0.16),
    pools: slabs.map((_, i) => ({ x: i * WORKS_SPACING, z: WORKS_Z + 0.6, r: 2.5, strength: 0.2 })),
    /** Textures stream in only when the hall comes near. */
    load(maxAnisotropy) {
      if (loaded) return;
      loaded = true;
      slabs.forEach((s) => {
        if (!s.src) return;
        loader.load(s.src, (texture) => {
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = Math.min(4, maxAnisotropy);
          s.screenMat.map = texture;
          s.screenMat.color.setRGB(1, 1, 1);
          s.screenMat.needsUpdate = true;
        });
      });
    },
    /** u: progress through the pinned hall — the same track the page's cards follow, so a
     *  screen lights as its copy appears and dims as the camera moves on.
     *  arrive/leave: the camera's moves into and out of the hall (0..1). */
    update(dt, { camera, motion, presence = 1, gallery = true, arrive = 1, leave = 0, u = 0 }) {
      const focus = motion ? workFocus(u, slabs.length) : workIndex(u, slabs.length);
      // The hall powers up as the camera lands and down as it walks out.
      const lit = smoothstep(arrive, 0.55, 1) * (1 - smoothstep(leave, 0, 0.16));
      slabs.forEach((s, i) => {
        const rise = MathUtils.clamp(presence * 1.6 - i * 0.3, 0, 1);
        s.holder.scale.y = Math.max(rise, 0.001);
        s.holder.visible = rise > 0.002;
        // In list mode the cards show the images, so the hall stays quiet.
        const on = gallery ? smoothstep(1 - Math.abs(focus - i), 0, 1) * lit : 0;
        const face = Math.atan2(camera.position.x - s.holder.position.x, camera.position.z - WORKS_Z);
        s.holder.rotation.y = face * 0.35 * on;
        const glow = gallery ? lerp(0.22, 1, on) : 0.12;
        s.screenMat.opacity = s.screenMat.map ? glow : 0.6;
        s.bezelMat.opacity = Math.max(glow - 0.15, 0) * 1.1;
      });
    },
    dispose() {
      slabGeo.dispose();
      screenGeo.dispose();
      barGeo.dispose();
      panelMat.dispose();
      polished.dispose();
      bezelGeo.dispose();
      slabs.forEach((s) => {
        s.screenMat.map?.dispose();
        s.screenMat.dispose();
        s.bezelMat.dispose();
      });
    },
  };
}

/* ------------------------------------------------------------------------ */

export function createPortal(at) {
  const group = new Group();
  const R = 2.05;
  const frame = chrome();
  const inner = graphite();
  const ringGeo = new TorusGeometry(R, 0.085, 32, 220);
  const innerGeo = new TorusGeometry(R - 0.1, 0.012, 10, 220);

  const build = () => {
    const g = new Group();
    g.add(new Mesh(ringGeo, frame), new Mesh(innerGeo, inner));
    return g;
  };
  const ring = build();
  ring.position.copy(at);
  const mirror = build();
  mirror.position.set(at.x, -at.y, at.z);
  mirror.scale.y = -1;

  // Inside the ring: a membrane of liquid metal — fine concentric ripples that surge on send.
  const veilMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLevel: { value: 0.5 },
      uSurge: { value: 0 },
      uFlash: { value: 0 },
      uColor: { value: new Vector3(...srgb(0x7a7a7c)) },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uLevel, uSurge, uFlash; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float waves = sin(r * 26.0 - uTime * 0.7) * 0.5 + 0.5;
        float surge = sin(r * 22.0 - uSurge * 24.0) * 0.5 + 0.5;
        float front = 1.0 - smoothstep(0.0, 0.25, abs(r - uSurge * 1.2));
        float edge = 1.0 - smoothstep(0.82, 1.0, r);
        // At rest: a concave sheen towards the rim and the faintest drift of rings.
        float sheen = smoothstep(0.35, 1.0, r) * 0.07;
        float v = (sheen + pow(waves, 8.0) * 0.025 * uLevel + pow(surge, 4.0) * front * 0.3 * uFlash) * edge;
        gl_FragColor = vec4(uColor, v);
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const veil = new Mesh(new CircleGeometry(R - 0.1, 96), veilMat);
  veil.position.copy(at);
  group.add(ring, mirror, veil);

  let time = 0;
  let pulse = 1;
  return {
    group,
    pools: [{ x: at.x, z: at.z + 0.2, r: 2.2, strength: 0.18 }],
    pulse() {
      pulse = 0;
    },
    /** u: the camera's approach. The membrane wakes as the invitation to write comes in. */
    update(dt, { motion, u = 0 }) {
      if (motion) time += dt;
      pulse = Math.min(pulse + dt / 2.6, 1);
      const flash = pulse < 1 ? Math.sin(pulse * Math.PI) : 0;
      veilMat.uniforms.uTime.value = time;
      veilMat.uniforms.uLevel.value = lerp(0.5, 1.6, smoothstep(u, 0, 0.6)) + flash;
      veilMat.uniforms.uSurge.value = pulse;
      veilMat.uniforms.uFlash.value = flash;
      // The ring breathes once when a message leaves.
      const k = 1 + flash * 0.035;
      ring.scale.setScalar(k);
      mirror.scale.set(k, -k, k);
    },
    dispose() {
      ringGeo.dispose();
      innerGeo.dispose();
      frame.dispose();
      inner.dispose();
      veil.geometry.dispose();
      veilMat.dispose();
    },
  };
}
