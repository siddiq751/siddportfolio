import {
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { SIMPLEX } from './glsl.js';
import { createCorona, radialTexture } from './environment.js';

const RADIUS = 1;

/**
 * Black chrome with a living surface. Displacement and its normals are computed in
 * the vertex shader, so reflections ripple like liquid metal while staying PBR.
 */
function createChromeMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.011 },
    uPoint: { value: new Vector3(0, 0, 1) },
    uPress: { value: 0 },
    uRipple: { value: 10 },
    uRippleAmp: { value: 0 },
  };
  const material = new MeshPhysicalMaterial({
    color: 0x1d1d1f,
    metalness: 1,
    roughness: 0.075,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    envMapIntensity: 1.5,
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
  material.customProgramCacheKey = () => 'dimension-core';
  return { material, uniforms };
}

function createTitanium() {
  return new MeshPhysicalMaterial({ color: 0xb8b4aa, metalness: 1, roughness: 0.22, envMapIntensity: 1.25 });
}

function createBone() {
  return new MeshPhysicalMaterial({
    color: 0xece7dd,
    roughness: 0.42,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    sheen: 0.4,
    sheenColor: 0xffffff,
  });
}

/** Builds the subject twice: the real one and its mirror for floor reflections. */
function buildSubject({ sphere, chrome, titanium, bone }) {
  const root = new Group();
  const core = new Mesh(sphere, chrome);
  root.add(core);

  const precessA = new Group();
  const tiltA = new Group();
  tiltA.rotation.set(1.18, 0, -0.22);
  const ringA = new Mesh(new TorusGeometry(1.82, 0.011, 12, 240), titanium);
  tiltA.add(ringA);
  precessA.add(tiltA);

  const precessB = new Group();
  const tiltB = new Group();
  tiltB.rotation.set(-1.0, 0, 0.5);
  const ringB = new Mesh(new TorusGeometry(2.28, 0.007, 10, 240), titanium);
  const moon = new Mesh(new SphereGeometry(0.11, 32, 24), bone);
  tiltB.add(ringB, moon);
  precessB.add(tiltB);

  root.add(precessA, precessB);
  return { root, core, precessA, precessB, tiltA, tiltB, moon };
}

export function createCore(quality) {
  const sphere = new SphereGeometry(RADIUS, ...quality.sphere);
  const { material: chrome, uniforms } = createChromeMaterial();
  const titanium = createTitanium();
  const bone = createBone();

  const group = new Group();
  const primary = buildSubject({ sphere, chrome, titanium, bone });
  const mirror = buildSubject({ sphere, chrome, titanium, bone });
  const mirrorRoot = new Group();
  mirrorRoot.scale.y = -1;
  mirrorRoot.add(mirror.root);
  group.add(primary.root, mirrorRoot);

  const corona = createCorona(RADIUS);
  group.add(corona);

  const shadow = new Mesh(
    new PlaneGeometry(3.2, 3.2),
    new MeshBasicMaterial({
      color: 0x000000,
      map: radialTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.renderOrder = -4;
  group.add(shadow);

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
    update(dt, { motion, camera, energy = 0, rise = 1, glow = 0.35 }) {
      if (motion) state.time += dt;
      const t = state.time;
      uniforms.uTime.value = t;
      uniforms.uRipple.value += dt;
      state.press = MathUtils.damp(state.press, energy, 5, dt || 1);
      uniforms.uPress.value = state.press;

      const lift = MathUtils.lerp(-2.4, 0, rise);
      primary.root.position.set(HOME.x, HOME.y + lift + (motion ? Math.sin(t * 0.8) * 0.05 : 0), HOME.z);
      if (motion) {
        primary.precessA.rotation.y += dt * 0.06;
        primary.precessB.rotation.y -= dt * 0.045;
        state.moon -= dt * 0.22;
      }
      primary.moon.position.set(Math.cos(state.moon) * 2.28, Math.sin(state.moon) * 2.28, 0);
      sync(primary, mirror);

      corona.position.copy(primary.root.position);
      corona.quaternion.copy(camera.quaternion);
      corona.material.uniforms.uIntensity.value = glow;
      corona.visible = rise > 0.05;

      const height = primary.root.position.y - RADIUS;
      shadow.material.opacity = MathUtils.clamp(0.6 - height * 0.35, 0, 0.6) * rise;
      shadow.scale.setScalar(1 + Math.max(height, 0) * 0.4);
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
      chrome.dispose();
      titanium.dispose();
      bone.dispose();
      corona.geometry.dispose();
      corona.material.dispose();
      shadow.geometry.dispose();
      shadow.material.map.dispose();
      shadow.material.dispose();
      group.traverse((o) => o.isMesh && o.geometry !== sphere && o.geometry.dispose());
    },
  };
}
