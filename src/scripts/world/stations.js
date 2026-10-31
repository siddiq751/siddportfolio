import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
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
import { createCorona, radialTexture } from './environment.js';

const { damp } = MathUtils;

/** Procedural travertine: vertical strata and pores, no textures. */
function createStone(color = 0x2b2926, envMapIntensity = 0.55) {
  const m = new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, envMapIntensity });
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
        float pores = smoothstep(0.82, 0.9, vnoise(vStone.xy * 14.0 + vStone.zx * 14.0));
        diffuseColor.rgb *= (0.8 + strata * 0.34) * (1.0 - pores * 0.35);`,
      );
  };
  m.customProgramCacheKey = () => 'stone';
  return m;
}

const blackChrome = () =>
  new MeshPhysicalMaterial({
    color: 0x1d1d1f,
    metalness: 1,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.5,
  });
const titanium = () =>
  new MeshPhysicalMaterial({ color: 0xb8b4aa, metalness: 1, roughness: 0.22, envMapIntensity: 1.25 });
const bone = () =>
  new MeshPhysicalMaterial({ color: 0xece7dd, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25 });
const lightMaterial = (hex, intensity) => {
  const m = new MeshBasicMaterial({ side: DoubleSide });
  m.color.set(hex).multiplyScalar(intensity);
  return m;
};

/** A vertical beam of light (billboard with soft edges). */
function createShaft(width, height, hex = 0xfff1e2, opacity = 0.09) {
  const material = new ShaderMaterial({
    uniforms: { uColor: { value: new Vector3(...srgb(hex)) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main() {
        float side = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
        float fall = mix(0.35, 1.0, vUv.y);
        float a = side * fall * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  return new Mesh(new PlaneGeometry(width, height), material);
}

/** The Eclipse mark etched in fine light lines, for the glass slab. */
function markTexture() {
  const s = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(236,231,221,0.55)';
  ctx.lineWidth = 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, s, s * 0.62);
  ctx.clip();
  for (const r of [150, 118]) {
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.5, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,138,61,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.12, s * 0.62);
  ctx.lineTo(s * 0.88, s * 0.62);
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* ------------------------------------------------------------------------ */

export function createOrigin(quality) {
  const group = new Group();
  // Near-black stone: from the hero only the slit of light reads, like a doorway on the horizon.
  const stone = createStone(0x1a1916, 0.25);
  const disposables = [stone];

  // The monolith with a slit of light; the camera passes through it.
  const SLIT_Z = -15;
  const left = new Mesh(new BoxGeometry(3.4, 7.6, 1.3), stone);
  left.position.set(-2.65, 3.8, SLIT_Z);
  const right = left.clone();
  right.position.x = 2.65;
  const lintel = new Mesh(new BoxGeometry(1.9, 1.3, 1.3), stone);
  lintel.position.set(0, 6.95, SLIT_Z);
  const slitLight = lightMaterial(0xff8a3d, 2.6);
  disposables.push(slitLight);
  const arch = new Group();
  for (const x of [-0.94, 0.94]) {
    const strip = new Mesh(new PlaneGeometry(0.035, 6.3), slitLight);
    strip.position.set(x, 3.15, SLIT_Z + 0.66);
    arch.add(strip);
  }
  arch.add(left, right, lintel);
  group.add(arch);

  // The room: a glass slab carrying the etched mark, under a shaft of light.
  const ROOM = new Vector3(0, 0, -30);
  const slabGroup = new Group();
  slabGroup.position.set(ROOM.x, 0, ROOM.z);
  slabGroup.rotation.y = -0.2;
  const glass = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 0.3,
    ior: 1.5,
    dispersion: quality.dispersion,
    attenuationColor: new Color(0xe8eef0),
    attenuationDistance: 2.5,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.4,
  });
  const slab = new Mesh(new RoundedBoxGeometry(2.5, 3.3, 0.12, 4, 0.04), glass);
  slab.position.y = 2.1;
  const markTex = markTexture();
  const markMat = new MeshBasicMaterial({
    map: markTex,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const mark = new Mesh(new PlaneGeometry(2.1, 2.1), markMat);
  mark.position.set(0, 2.15, 0.075);
  const plinth = new Mesh(new BoxGeometry(3.3, 0.36, 0.95), stone);
  plinth.position.y = 0.18;
  slabGroup.add(slab, mark, plinth);
  disposables.push(glass, markTex, markMat);

  const shaft = createShaft(3.6, 9.5);
  shaft.position.set(ROOM.x, 4.75, ROOM.z - 0.7);
  disposables.push(shaft.material);

  const seed = new Mesh(new SphereGeometry(0.2, 48, 32), blackChrome());
  disposables.push(seed.material);
  group.add(slabGroup, shaft, seed);

  let time = 0;
  return {
    group,
    slitZ: SLIT_Z,
    pools: [
      { x: 0, z: SLIT_Z + 1.2, r: 1.6, color: [1, 0.54, 0.24], strength: 0.18 },
      { x: ROOM.x, z: ROOM.z + 0.4, r: 2.4, color: [0.95, 0.9, 0.82], strength: 0.12 },
    ],
    update(dt, { motion, camera, presence = 1 }) {
      if (motion) time += dt;
      // The monolith rises out of the floor as the journey begins.
      arch.scale.y = Math.max(presence, 0.001);
      arch.visible = presence > 0.002;
      seed.position.set(ROOM.x, 4.35 + (motion ? Math.sin(time * 1.1) * 0.08 : 0), ROOM.z);
      shaft.quaternion.copy(camera.quaternion);
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
  const materials = [blackChrome(), titanium(), bone()];
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
    return { band, spin, shards, scale: 1, speed: 0.12 + gi * 0.05 };
  });

  // Fine dust of tiny shards along the orbits.
  const dustGeo = new TetrahedronGeometry(0.045, 0);
  const dust = new InstancedMesh(dustGeo, materials[1], quality.shards);
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

  const heart = new Mesh(new SphereGeometry(0.34, 64, 48), blackChrome());
  const heartGlow = createCorona(0.34);
  group.add(heart, heartGlow);

  const active = { group: null, item: null, filter: null };
  const helper = new Object3D();

  return {
    group,
    pools: [{ x: CENTER.x, z: CENTER.z, r: 2.6, color: [1, 0.6, 0.32], strength: 0.08 }],
    highlight(g, i) {
      active.group = g;
      active.item = i;
    },
    filter(g) {
      active.filter = g;
    },
    update(dt, { motion, camera }) {
      bands.forEach((b, gi) => {
        if (motion) b.spin.rotation.z += dt * b.speed;
        const target = active.filter === null ? 1 : active.filter === gi ? 1.1 : 0.78;
        b.scale = damp(b.scale, target, 4, dt || 1);
        b.band.scale.setScalar(b.scale);
        b.shards.forEach((mesh, ii) => {
          const on = active.group === gi && active.item === ii;
          const k = damp(mesh.scale.x, on ? 2.1 : 1, 6, dt || 1);
          mesh.scale.setScalar(k);
          if (motion) mesh.rotation.y += dt * (on ? 1.6 : 0.4);
        });
      });
      if (motion) dust.rotation.z += dt * 0.02;
      helper.quaternion.copy(camera.quaternion);
      heartGlow.quaternion.copy(camera.quaternion);
      heartGlow.material.uniforms.uIntensity.value = active.group === null ? 0.5 : 0.9;
    },
    dispose() {
      shardGeo.dispose();
      dustGeo.dispose();
      dust.dispose();
      heart.geometry.dispose();
      heartGlow.geometry.dispose();
      heartGlow.material.dispose();
      materials.forEach((mat) => mat.dispose());
      heart.material.dispose();
    },
  };
}

/* ------------------------------------------------------------------------ */

export const WORKS_Z = -78;
export const WORKS_SPACING = 8;

export function createWorks(images) {
  const group = new Group();
  const stone = createStone(0x1b1b1a, 0.18);
  const slabGeo = new BoxGeometry(4.1, 4.4, 0.5);
  const screenGeo = new PlaneGeometry(3.52, 2.2);
  const lineGeo = new PlaneGeometry(3.52, 0.012);
  const lineMat = lightMaterial(0xff8a3d, 2);
  const loader = new TextureLoader();
  let loaded = false;

  const slabs = images.map((src, i) => {
    const x = i * WORKS_SPACING;
    const holder = new Group();
    holder.position.set(x, 0, WORKS_Z);
    const slab = new Mesh(slabGeo, stone);
    slab.position.y = 2.2;
    const screenMat = new MeshBasicMaterial({ color: 0x111312, toneMapped: false });
    const screen = new Mesh(screenGeo, screenMat);
    screen.position.set(0, 2.55, 0.26);
    const line = new Mesh(lineGeo, lineMat);
    line.position.set(0, 2.55 - 1.25, 0.26);
    holder.add(slab, screen, line);
    group.add(holder);
    return { holder, screen, screenMat, src, glow: 0.4 };
  });

  let active = 0;
  return {
    group,
    count: slabs.length,
    slabX: (i) => i * WORKS_SPACING,
    screenAnchor: (i) => new Vector3(i * WORKS_SPACING, 2.55, WORKS_Z + 0.26),
    pools: slabs.map((_, i) => ({
      x: i * WORKS_SPACING,
      z: WORKS_Z + 1.4,
      r: 2.2,
      color: [0.85, 0.88, 0.9],
      strength: 0.07,
    })),
    setActive(i) {
      active = i;
    },
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
    update(dt, { camera, presence = 1, gallery = true }) {
      slabs.forEach((s, i) => {
        const rise = MathUtils.clamp(presence * 1.6 - i * 0.3, 0, 1);
        s.holder.scale.y = Math.max(rise, 0.001);
        s.holder.visible = rise > 0.002;
        // In list mode the cards show the images, so the hall stays quiet.
        const on = gallery && i === active;
        const face = Math.atan2(camera.position.x - s.holder.position.x, camera.position.z - WORKS_Z);
        s.holder.rotation.y = damp(s.holder.rotation.y, on ? face * 0.35 : 0, 3, dt || 1);
        s.glow = damp(s.glow, on ? 1 : gallery ? 0.16 : 0.08, 4, dt || 1);
        if (s.screenMat.map) s.screenMat.color.setScalar(s.glow);
      });
    },
    dispose() {
      slabGeo.dispose();
      screenGeo.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      stone.dispose();
      slabs.forEach((s) => {
        s.screenMat.map?.dispose();
        s.screenMat.dispose();
      });
    },
  };
}

/* ------------------------------------------------------------------------ */

export function createPortal(at) {
  const group = new Group();
  const R = 2.3;
  const frame = titanium();
  const inner = lightMaterial(0xff8a3d, 3);
  const ringGeo = new TorusGeometry(R, 0.085, 24, 200);
  const innerGeo = new TorusGeometry(R - 0.09, 0.014, 8, 200);

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

  // Inside the portal: a faint swirl of light (the dimension beyond).
  const veilMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0.5 }, uColor: { value: new Vector3(...srgb(0xff8a3d)) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uLevel; uniform vec3 uColor; varying vec2 vUv;
      ${HASH}
      ${VALUE_NOISE}
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = atan(p.y, p.x);
        float swirl = vnoise(vec2(a * 2.0 + uTime * 0.15 + r * 3.0, r * 4.0 - uTime * 0.2));
        float edge = smoothstep(1.0, 0.7, r);
        float v = (swirl * 0.5 + 0.25) * smoothstep(0.0, 1.0, r) * edge * 0.18 * uLevel;
        gl_FragColor = vec4(uColor * v, v);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const veil = new Mesh(new CircleGeometry(R - 0.1, 96), veilMat);
  veil.position.copy(at);

  const glow = createCorona(R - 0.09);
  glow.position.copy(at);

  const beamTex = radialTexture();
  const beamMat = new MeshBasicMaterial({
    map: beamTex,
    color: 0xffb27a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const beam = new Mesh(new PlaneGeometry(1.4, 1.4), beamMat);
  group.add(ring, mirror, veil, glow, beam);

  let time = 0;
  let pulse = 1;
  return {
    group,
    pools: [{ x: at.x, z: at.z + 0.6, r: 2.8, color: [1, 0.54, 0.24], strength: 0.16 }],
    pulse() {
      pulse = 0;
    },
    update(dt, { motion, camera }) {
      if (motion) time += dt;
      pulse = Math.min(pulse + dt / 2.6, 1);
      const flash = pulse < 1 ? Math.sin(pulse * Math.PI) : 0;
      veilMat.uniforms.uTime.value = time;
      veilMat.uniforms.uLevel.value = 0.55 + flash * 2;
      glow.quaternion.copy(camera.quaternion);
      glow.material.uniforms.uIntensity.value = 0.4 + flash * 1.4;
      beam.quaternion.copy(camera.quaternion);
      beam.position.set(at.x, at.y + MathUtils.lerp(0, 12, pulse), at.z);
      beamMat.opacity = flash;
    },
    dispose() {
      ringGeo.dispose();
      innerGeo.dispose();
      frame.dispose();
      inner.dispose();
      veil.geometry.dispose();
      veilMat.dispose();
      glow.geometry.dispose();
      glow.material.dispose();
      beam.geometry.dispose();
      beamTex.dispose();
      beamMat.dispose();
    },
  };
}
