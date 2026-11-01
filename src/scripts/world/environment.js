import {
  BackSide,
  CanvasTexture,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from 'three';
import { HASH, VALUE_NOISE, srgb } from './glsl.js';

/** Soft shadows the floor can carry at once (nearest to the camera). */
export const POOLS = 6;

/**
 * The cyclorama: a seamless white backdrop that falls off to a cool grey overhead, with one
 * hairline seam where the floor meets it — the horizon. Follows the camera.
 */
export function createSky() {
  const material = new ShaderMaterial({
    uniforms: {
      uTop: { value: new Vector3(...srgb(0xe4e5e7)) },
      uHorizon: { value: new Vector3(...srgb(0xf5f5f5)) },
      uBelow: { value: new Vector3(...srgb(0xf6f6f6)) },
      uSeam: { value: new Vector3(...srgb(0xbdbdbd)) },
      uIntensity: { value: 1 },
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
      uniform vec3 uTop, uHorizon, uBelow, uSeam;
      uniform float uIntensity, uReveal;
      varying vec3 vDir;
      ${HASH}
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        // Backdrop: brightest just above the floor, a gentle fall-off towards the ceiling.
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, e));
        col += vec3(0.018) * exp(-max(e, 0.0) * 14.0);
        col = e < 0.0 ? uBelow : col;
        // The seam: drawn outwards from the centre during the intro.
        float az = abs(atan(d.x, -d.z));
        float mask = smoothstep(uReveal * 3.3, uReveal * 3.3 - 0.4, az);
        float seam = exp(-abs(e) * 1400.0) * 0.5 + exp(-abs(e) * 160.0) * 0.06;
        col = mix(col, uSeam, clamp(seam * mask * uIntensity, 0.0, 1.0));
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
 * Infinite white lacquer: large-format joints on a 4-unit module, a whisper of grain, soft
 * shadow pools under every object and haze towards the seam. Slightly translucent near the
 * camera so mirrored subjects read as reflections in a glossy floor. It can also ripple
 * like liquid where the Core breaks the surface.
 */
export function createFloor() {
  const pools = Array.from({ length: POOLS }, () => new Vector4(0, 0, 1, 0));
  const material = new ShaderMaterial({
    uniforms: {
      uBase: { value: new Vector3(...srgb(0xfafafa)) },
      uFar: { value: new Vector3(...srgb(0xefefef)) },
      uShadow: { value: new Vector3(...srgb(0x9a9a9c)) },
      uPools: { value: pools },
      uRipple: { value: new Vector4(0, 0, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uFar, uShadow;
      uniform vec4 uPools[${POOLS}];
      uniform vec4 uRipple;
      varying vec3 vWorld;
      ${HASH}
      ${VALUE_NOISE}
      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        float n = vnoise(vWorld.xz * 0.3) * 0.6 + vnoise(vWorld.xz * 2.2) * 0.4;
        vec3 col = uBase * (0.988 + n * 0.02);

        // Joints between large porcelain-white panels.
        vec2 g = abs(fract(vWorld.xz / 4.0 - 0.5) - 0.5) * 4.0;
        vec2 w = fwidth(vWorld.xz) * 1.2 + 0.008;
        float joint = 1.0 - min(smoothstep(0.0, w.x, g.x), smoothstep(0.0, w.y, g.y));
        joint *= 1.0 - smoothstep(6.0, 26.0, dist);
        col *= 1.0 - joint * 0.03;

        // Liquid ripple (intro): rings of light and shade spreading from the breach.
        vec2 rp = vWorld.xz - uRipple.xy;
        float rr = length(rp);
        float front = uRipple.z * 1.9;
        float ring = sin(rr * 9.0 - uRipple.z * 5.5) * exp(-rr * 0.55) * (1.0 - smoothstep(front - 0.6, front + 0.4, rr));
        col *= 1.0 + ring * uRipple.w * 0.06;

        // Soft shadows: ambient occlusion pools under objects.
        float occ = 0.0;
        for (int i = 0; i < ${POOLS}; i++) {
          vec4 p = uPools[i];
          vec2 dp = vWorld.xz - p.xy;
          occ += p.w * exp(-dot(dp, dp) / (p.z * p.z));
        }
        col = mix(col, uShadow, clamp(occ, 0.0, 0.6));

        // Grazing angles pick up the backdrop; distance dissolves into studio haze.
        float graze = pow(1.0 - clamp(v.y, 0.0, 1.0), 12.0);
        float haze = 1.0 - exp(-pow(dist * 0.016, 1.4));
        col = mix(col, uFar, clamp(haze + graze * 0.5, 0.0, 1.0));

        float alpha = mix(0.885, 1.0, smoothstep(6.0, 26.0, dist));
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
  return { mesh, pools, ripple: material.uniforms.uRipple.value };
}

/** Soft radial falloff texture (white, alpha in the gradient) — used for contact shadows. */
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
