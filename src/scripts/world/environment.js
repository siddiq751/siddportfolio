import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from 'three';
import { HASH, VALUE_NOISE, srgb } from './glsl.js';

export const POOLS = 6;

/** Sky dome: void above, the line of light at the horizon. Follows the camera. */
export function createSky() {
  const material = new ShaderMaterial({
    uniforms: {
      uTop: { value: new Vector3(...srgb(0x050606)) },
      uMid: { value: new Vector3(...srgb(0x0c0e0d)) },
      uLine: { value: new Vector3(...srgb(0xff8a3d)) },
      uIntensity: { value: 1 },
      uGlow: { value: 1 },
      uReveal: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uLine;
      uniform float uIntensity, uGlow, uReveal;
      varying vec3 vDir;
      ${HASH}
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 col = mix(uMid, uTop, smoothstep(0.0, 0.42, e));
        float az = abs(atan(d.x, -d.z));
        float mask = smoothstep(uReveal * 3.3, uReveal * 3.3 - 0.4, az);
        float line = exp(-abs(e) * 560.0) * 1.3 + exp(-abs(e) * 80.0) * 0.26;
        float glow = exp(-max(e, 0.0) * 9.0) * 0.1 * uGlow;
        col += uLine * (line * mask + glow) * uIntensity;
        col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new SphereGeometry(400, 64, 32), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Infinite polished stone: subtle noise, expansion joints on the 4-unit module,
 * horizon sheen at grazing angles, light pools under subjects. Semi-transparent
 * near the camera so mirrored subjects read as reflections.
 */
export function createFloor() {
  const pools = Array.from({ length: POOLS }, () => new Vector4(0, 0, 1, 0));
  const poolColors = Array.from({ length: POOLS }, () => new Vector3(1, 1, 1));
  const material = new ShaderMaterial({
    uniforms: {
      uBase: { value: new Vector3(...srgb(0x101211)) },
      uLine: { value: new Vector3(...srgb(0xff8a3d)) },
      uFar: { value: new Vector3(...srgb(0x161210)) },
      uIntensity: { value: 1 },
      uPools: { value: pools },
      uPoolColors: { value: poolColors },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uLine, uFar;
      uniform float uIntensity;
      uniform vec4 uPools[${POOLS}];
      uniform vec3 uPoolColors[${POOLS}];
      varying vec3 vWorld;
      ${HASH}
      ${VALUE_NOISE}
      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        float n = vnoise(vWorld.xz * 0.35) * 0.6 + vnoise(vWorld.xz * 1.9) * 0.4;
        vec3 col = uBase * (0.86 + n * 0.24);

        vec2 g = abs(fract(vWorld.xz / 4.0 - 0.5) - 0.5) * 4.0;
        vec2 w = fwidth(vWorld.xz) * 1.4 + 0.012;
        float joint = 1.0 - min(smoothstep(0.0, w.x, g.x), smoothstep(0.0, w.y, g.y));
        joint *= 1.0 - smoothstep(18.0, 55.0, dist);
        col *= 1.0 - joint * 0.4;

        float graze = pow(1.0 - clamp(v.y, 0.0, 1.0), 16.0);
        col += uLine * graze * 0.24 * uIntensity;

        for (int i = 0; i < ${POOLS}; i++) {
          vec4 p = uPools[i];
          vec2 dp = vWorld.xz - p.xy;
          col += uPoolColors[i] * p.w * exp(-dot(dp, dp) / (p.z * p.z));
        }

        float haze = 1.0 - exp(-pow(dist * 0.012, 1.5));
        col = mix(col, uFar, haze);
        float alpha = mix(0.78, 1.0, smoothstep(5.0, 28.0, dist));
        col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(800, 800), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  return { mesh, pools, poolColors };
}

/** Light motes drifting through the dimension, animated entirely on the GPU. */
export function createMotes(count) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = -10 + Math.random() * 32;
    positions[i * 3 + 1] = 0.2 + Math.pow(Math.random(), 1.6) * 7;
    positions[i * 3 + 2] = 14 - Math.random() * 136;
    seeds[i] = Math.random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 1 },
      uColor: { value: new Vector3(...srgb(0xf3dcc4)) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * 0.25 + aSeed * 50.0;
        p += vec3(sin(t * 0.7) * 0.35, sin(t * 0.43 + aSeed * 6.0) * 0.25, cos(t * 0.53) * 0.35);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float depth = -mv.z;
        gl_PointSize = (1.2 + aSeed * 1.8) * uPixelRatio * (18.0 / max(depth, 1.0));
        float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0);
        vAlpha = twinkle * smoothstep(60.0, 8.0, depth) * smoothstep(0.6, 2.5, depth);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity * 0.55;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** Soft radial falloff texture (white, alpha in the gradient). */
export function radialTexture(
  size = 128,
  stops = [
    [0, 1],
    [0.35, 0.55],
    [0.7, 0.15],
    [1, 0],
  ],
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, a]) => g.addColorStop(at, `rgba(255,255,255,${a})`));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Camera-facing ring glow (the corona) sized so the ring sits on a sphere's limb. */
export function createCorona(radius, color = 0xff8a3d) {
  const size = radius * 4.4;
  const ringAt = (radius * 2) / size;
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Vector3(...srgb(color)) },
      uIntensity: { value: 0.35 },
      uRing: { value: ringAt },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity, uRing;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float ring = exp(-pow((r - uRing) / 0.035, 2.0)) * 0.9;
        float halo = exp(-max(r - uRing, 0.0) * 9.0) * step(uRing - 0.02, r) * 0.55;
        float a = (ring + halo) * uIntensity * smoothstep(1.0, 0.85, r);
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  return new Mesh(new PlaneGeometry(size, size), material);
}
