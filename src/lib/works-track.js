// The Works gallery's scroll track, shared by the page and the 3D hall so a project's copy and
// its screen always arrive together. The pinned stretch is split into equal slices, one per
// project. The camera holds on a project through the middle of its slice and travels to the
// next across the boundary, which is exactly where the copy changes.

/** Share of a slice, on each side of a boundary, spent travelling (0–0.5). */
const MOVE = 0.3;

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The project whose copy is shown at pinned progress `p` (0..1). */
export const workIndex = (p, count) => Math.min(count - 1, Math.floor(clamp01(p) * count));

/** Pinned progress at the middle of a project's hold — where its step button scrolls to. */
export const workProgress = (index, count) => (index + 0.5) / count;

/** Which screen the camera faces at progress `p`: whole numbers while holding, fractional while moving. */
export function workFocus(p, count) {
  const x = clamp01(p) * count;
  const boundary = Math.round(x);
  if (boundary <= 0 || boundary >= count) return Math.min(Math.floor(x), count - 1);
  const t = clamp01((x - boundary + MOVE) / (2 * MOVE));
  return boundary - 1 + ease(t);
}
