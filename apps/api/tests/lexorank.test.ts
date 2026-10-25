import { describe, expect, it } from 'vitest';
import { STEP, compact, needsCompaction, positionAfter, positionAt, positionBefore } from '../src/core/lexorank.js';

describe('lexorank ordering', () => {
  it('starts an empty column at the base step', () => {
    expect(positionAt([], 0)).toBe(STEP);
    expect(positionAfter(null)).toBe(STEP);
    expect(positionBefore(null)).toBe(STEP);
  });

  it('places an item between its neighbours', () => {
    expect(positionAt([1024, 2048], 1)).toBe(1536);
  });

  it('appends beyond the last item', () => {
    expect(positionAt([1024, 2048], 2)).toBe(3072);
  });

  it('prepends before the first item', () => {
    expect(positionAt([1024, 2048], 0)).toBe(0);
  });

  it('clamps an out-of-range index rather than producing a duplicate position', () => {
    expect(positionAt([1024, 2048], 99)).toBe(3072);
    expect(positionAt([1024, 2048], -5)).toBe(0);
  });

  it('keeps every position distinct across two thousand random reorderings', () => {
    let positions = compact(20);
    for (let i = 0; i < 2000; i += 1) {
      const from = Math.floor(Math.random() * positions.length);
      const to = Math.floor(Math.random() * positions.length);
      const without = positions.filter((_, index) => index !== from).sort((a, b) => a - b);
      positions = [...without, positionAt(without, to)].sort((a, b) => a - b);
      if (needsCompaction(positions)) positions = compact(positions.length);
    }
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('flags a column that has run out of room between neighbours', () => {
    expect(needsCompaction([1, 1.00001])).toBe(true);
    expect(needsCompaction([1, 2, 3])).toBe(false);
  });
});
