import { describe, expect, it } from 'vitest';
import {
  SCENES,
  clamp,
  createRun,
  distanceBetween,
  parseRecord,
  resultText,
  updateRecord,
} from './game';

describe('anti-perfect-fit game rules', () => {
  it('clamps dragging values to the board', () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });

  it('measures the final near miss instead of snapping it away', () => {
    expect(distanceBetween({ x: 53.2, y: 34.2 }, { x: 50, y: 36 })).toBeCloseTo(3.64, 1);
    expect(distanceBetween({ x: 80, y: 80 }, { x: 50, y: 36 })).toBeGreaterThan(40);
  });

  it('creates one doomed attempt per scene', () => {
    expect(createRun('2026-09-10T00:00:00.000Z')).toEqual({
      attempts: SCENES.length,
      completedAt: '2026-09-10T00:00:00.000Z',
    });
  });

  it('records completed runs and failed attempts', () => {
    const run = createRun('2026-09-10T00:00:00.000Z');
    expect(updateRecord({ completedRuns: 3, failedAttempts: 12, lastCompletedAt: 'before' }, run)).toEqual({
      completedRuns: 4,
      failedAttempts: 16,
      lastCompletedAt: '2026-09-10T00:00:00.000Z',
    });
  });

  it('rejects malformed stored records', () => {
    expect(parseRecord('{"completedRuns":4}')).toBeNull();
    expect(parseRecord('not json')).toBeNull();
  });

  it('shares the joke instead of pretending the run was successful', () => {
    const text = resultText(createRun('2026-09-10T00:00:00.000Z'));
    expect(text).toContain('4번 모두 실패했습니다');
    expect(text).not.toContain('성공');
  });
});
