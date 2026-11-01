import {
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Plane,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { SIMPLEX } from './glsl.js';
import { radialTexture } from './environment.js';

const RADIUS = 1;

/** Keeps what is above the floor (the subject) or below it (its reflection). */
const ABOVE = [new Plane(new Vector3(0, 1, 0), 0)];
const BELOW = [new Plane(new Vector3(0, -1, 0), 0)];

/**
 * Liquid chrome with a living surface. Displacement and its normals are computed in the
 * vertex shader, so studio reflections ripple like mercury while staying PBR.
 */
function createChromeMaterial(uniforms, clippingPlanes) {
  const material = new MeshPhysicalMaterial({
    color: 0xe4e4e4,
    metalness: 1,
    roughness: 0.035,
    envMapIntensity: 1,
    clippingPlanes,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime, uAmp, uPress, uRipple, uRippleAmp;
        uniform vec3 uPoint;
        ${SIMPLEX}
        vec3 displaceP(vec3 p) {
          vec3 n = normalize(p);
          float d = snoise(n * 1.15 + vec3(uTime * 0.08, uTime * 0.05, 0.0)) * uAmp;
          float g = dot(n, uPoint);
          float press = smoothstep(0.82, 1.0, g) * uPress * -0.07;
          float ang = acos(clamp(g, -1.0, 1.0));
          float wave = sin(ang * 16.0 - uRipple * 7.0) * exp(-uRipple * 1.4) * exp(-ang * 2.0) * uRippleAmp;
          return n * (1.0 + d + press + wave);
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 dispPos = displaceP(position);
        vec3 nrm = normalize(position);
        vec3 tng = normalize(cross(nrm, abs(nrm.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 btg = cross(nrm, tng);
        vec3 pA = displaceP(position + tng * 0.012);
        vec3 pB = displaceP(position + btg * 0.012);
        vec3 objectNormal = normalize(cross(pA - dispPos, pB - dispPos));
        if (dot(objectNormal, nrm) < 0.0) objectNormal = -objectNormal;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = dispPos;');
  };
  material.customProgramCacheKey = () => 'studio-core';
  return material;
}

/** Polished and satin aluminium for the rings; the moon is a bead of black chrome — the one ink accent. */
function createMaterials(uniforms, clippingPlanes) {
  return {
    chrome: createChromeMaterial(uniforms, clippingPlanes),
    polished: new MeshPhysicalMaterial({
      color: 0xdedede,
      metalness: 1,
      roughness: 0.1,
      envMapIntensity: 1,
      clippingPlanes,
    }),
    satin: new MeshPhysicalMaterial({
      color: 0xc9c9c9,
      metalness: 1,
      roughness: 0.32,
      envMapIntensity: 1.1,
      clippingPlanes,
    }),
    ink: new MeshPhysicalMaterial({
      color: 0x262626,
      metalness: 1,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.4,
      clippingPlanes,
    }),
  };
}

/** Builds the subject twice: the real one and its mirror for floor reflections. */
function buildSubject(sphere, { chrome, polished, satin, ink }) {
  const root = new Group();
  const core = new Mesh(sphere, chrome);
  root.add(core);

  const precessA = new Group();
  const tiltA = new Group();
  tiltA.rotation.set(1.18, 0, -0.22);
  const ringA = new Mesh(new TorusGeometry(1.82, 0.014, 16, 240), polished);
  tiltA.add(ringA);
  precessA.add(tiltA);

  const precessB = new Group();
  const tiltB = new Group();
  tiltB.rotation.set(-1.0, 0, 0.5);
  const ringB = new Mesh(new TorusGeometry(2.28, 0.008, 12, 240), satin);
  const moon = new Mesh(new SphereGeometry(0.12, 40, 28), ink);
  tiltB.add(ringB, moon);
  precessB.add(tiltB);

  root.add(precessA, precessB);
  return { root, core, precessA, precessB, tiltA, tiltB, moon };
}

function shadowPlane(texture, size, opacity) {
  const mesh = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({ color: 0x111111, map: texture, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -4;
  return mesh;
}

export function createCore(quality) {
  const sphere = new SphereGeometry(RADIUS, ...quality.sphere);
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.011 },
    uPoint: { value: new Vector3(0, 0, 1) },
    uPress: { value: 0 },
    uRipple: { value: 10 },
    uRippleAmp: { value: 0 },
  };
  const above = createMaterials(uniforms, ABOVE);
  const below = createMaterials(uniforms, BELOW);

  const group = new Group();
  const primary = buildSubject(sphere, above);
  const mirror = buildSubject(sphere, below);
  const mirrorRoot = new Group();
  mirrorRoot.scale.y = -1;
  mirrorRoot.add(mirror.root);
  group.add(primary.root, mirrorRoot);

  // Two shadows, like a real studio: a wide soft umbra and a tighter occlusion core.
  const shadowTex = radialTexture();
  const softShadow = shadowPlane(shadowTex, 3.6, 0.2);
  const coreShadow = shadowPlane(shadowTex, 1.7, 0.32);
  group.add(softShadow, coreShadow);

  const HOME = new Vector3(0, 1.78, 0);
  const state = { time: 0, moon: 2.2, press: 0 };

  const sync = (from, to) => {
    to.root.position.copy(from.root.position);
    to.root.scale.copy(from.root.scale);
    to.precessA.rotation.copy(from.precessA.rotation);
    to.precessB.rotation.copy(from.precessB.rotation);
    to.tiltA.rotation.copy(from.tiltA.rotation);
    to.tiltB.rotation.copy(from.tiltB.rotation);
    to.moon.position.copy(from.moon.position);
  };

  return {
    group,
    core: primary.core,
    /** rise: 0 = submerged below the floor (intro start), 1 = floating. */
    update(dt, { motion, energy = 0, rise = 1 }) {
      if (motion) state.time += dt;
      const t = state.time;
      uniforms.uTime.value = t;
      uniforms.uRipple.value += dt;
      state.press = MathUtils.damp(state.press, energy, 5, dt || 1);
      uniforms.uPress.value = state.press;

      const lift = MathUtils.lerp(-2.4, 0, rise);
      primary.root.position.set(HOME.x, HOME.y + lift + (motion ? Math.sin(t * 0.5) * 0.05 : 0), HOME.z);
      if (motion) {
        primary.precessA.rotation.y += dt * 0.035;
        primary.precessB.rotation.y -= dt * 0.026;
        state.moon -= dt * 0.13;
      }
      primary.moon.position.set(Math.cos(state.moon) * 2.28, Math.sin(state.moon) * 2.28, 0);
      sync(primary, mirror);

      // Shadows tighten and darken as the sphere settles towards the floor.
      const height = primary.root.position.y - RADIUS;
      const present = MathUtils.smoothstep(primary.root.position.y + RADIUS, 0, 0.6);
      softShadow.material.opacity = MathUtils.clamp(0.22 - height * 0.06, 0.08, 0.22) * present;
      softShadow.scale.setScalar(1 + Math.max(height, 0) * 0.35);
      coreShadow.material.opacity = MathUtils.clamp(0.4 - height * 0.34, 0, 0.4) * present;
      coreShadow.scale.setScalar(0.8 + Math.max(height, 0) * 0.5);
    },
    /** Pointer touching the surface (object-space direction). */
    setPoint(dir) {
      uniforms.uPoint.value.copy(dir).normalize();
    },
    ripple(dir) {
      uniforms.uPoint.value.copy(dir).normalize();
      uniforms.uRipple.value = 0;
      uniforms.uRippleAmp.value = 0.035;
    },
    worldPosition: () => primary.root.position,
    dispose() {
      sphere.dispose();
      [above, below].forEach((set) => Object.values(set).forEach((m) => m.dispose()));
      shadowTex.dispose();
      group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.geometry !== sphere) o.geometry.dispose();
        if (o === softShadow || o === coreShadow) o.material.dispose();
      });
    },
  };
}
