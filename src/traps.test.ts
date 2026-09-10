import { describe, expect, it } from 'vitest';
import { advancePressure, approachFit, getTrap } from './traps';

describe('physical finish and retry rules', () => {
  it('uses a different trap on retry and cycles without ending the game', () => {
    for (const scene of ['slot', 'circle', 'stack', 'seal'] as const) {
      expect(new Set([0, 1, 2].map((attempt) => getTrap(scene, attempt).id)).size).toBe(3);
      expect(getTrap(scene, 3)).toEqual(getTrap(scene, 0));
    }
  });
  it('does not award a complete fit for proximity alone', () => {
    expect(approachFit(0)).toBe(98.5);
    expect(approachFit(0.5)).toBeGreaterThan(approachFit(2));
    expect(approachFit(10)).toBe(0);
  });
  it('builds pressure only while held and releases it on cancellation', () => {
    const held = advancePressure(0, true, 0.5, 1);
    expect(held).toBe(0.5);
    expect(advancePressure(held, false, 0.5, 1)).toBeLessThan(held);
    expect(advancePressure(0.1, false, 2, 1)).toBe(0);
    expect(advancePressure(0.9, true, 1, 1)).toBe(1);
  });
});
