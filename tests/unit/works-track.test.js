import { describe, expect, it } from 'vitest';
import { workFocus, workIndex, workProgress } from '../../src/lib/works-track.js';

describe('works track (page ↔ 3D hall sync)', () => {
  const n = 3;

  it('gives every project an equal slice of the pinned scroll', () => {
    expect([0, 0.2, 0.34, 0.5, 0.67, 0.9, 1].map((p) => workIndex(p, n))).toEqual([0, 0, 1, 1, 2, 2, 2]);
  });

  it('step buttons land in the middle of the hold, on their own project', () => {
    for (let i = 0; i < n; i++) {
      expect(workIndex(workProgress(i, n), n)).toBe(i);
      expect(workFocus(workProgress(i, n), n)).toBe(i);
    }
  });

  it('holds the camera on a screen while its copy is shown, and moves only across boundaries', () => {
    expect(workFocus(0, n)).toBe(0);
    expect(workFocus(0.2, n)).toBe(0);
    expect(workFocus(0.5, n)).toBe(1);
    expect(workFocus(1, n)).toBe(2);
    // Half way through a move exactly where the copy changes.
    expect(workFocus(1 / 3, n)).toBeCloseTo(0.5, 5);
    expect(workFocus(2 / 3, n)).toBeCloseTo(1.5, 5);
  });

  it('is continuous and never runs backwards', () => {
    let last = 0;
    for (let p = 0; p <= 1.0001; p += 0.001) {
      const f = workFocus(p, n);
      expect(f).toBeGreaterThanOrEqual(last);
      expect(f - last).toBeLessThan(0.05);
      last = f;
    }
  });

  it('copes with a single project', () => {
    expect(workIndex(0.7, 1)).toBe(0);
    expect(workFocus(0.7, 1)).toBe(0);
  });
});
