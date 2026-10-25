import { describe, expect, it } from 'vitest';
import { ID_PREFIX, isId, newId } from '../src/core/ids.js';

describe('identifiers', () => {
  it('produces prefixed, recognisable ids', () => {
    const id = newId(ID_PREFIX.task);
    expect(id.startsWith('tsk_')).toBe(true);
    expect(isId(id, ID_PREFIX.task)).toBe(true);
    expect(isId(id, ID_PREFIX.user)).toBe(false);
  });

  it('never collides across ten thousand ids', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId(ID_PREFIX.task)));
    expect(ids.size).toBe(10_000);
  });

  it('sorts lexicographically in creation order', async () => {
    const first = newId(ID_PREFIX.task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = newId(ID_PREFIX.task);
    expect(first < second).toBe(true);
  });

  it('rejects values that are not ids', () => {
    expect(isId('not-an-id')).toBe(false);
    expect(isId(42)).toBe(false);
    expect(isId(null)).toBe(false);
  });
});
