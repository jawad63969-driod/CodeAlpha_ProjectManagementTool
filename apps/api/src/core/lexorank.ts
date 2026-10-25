/**
 * Sparse fractional ranking for board ordering — ADR-006.
 *
 * Positions start at multiples of STEP. Inserting between two neighbours stores
 * their midpoint, so a move is a single-row UPDATE. Floating point eventually
 * runs out of room after roughly 50 consecutive midpoint insertions into the
 * same gap, so `needsCompaction` tells the caller when to renumber a column.
 */
export const STEP = 1024;
const MIN_GAP = 0.0001;

/** Position for appending after the last item (or the first item in an empty column). */
export const positionAfter = (last: number | null | undefined): number =>
  last == null ? STEP : last + STEP;

/** Position for inserting before the first item. */
export const positionBefore = (first: number | null | undefined): number =>
  first == null ? STEP : first - STEP;

/**
 * Position for slotting an item at `index` among `siblings` (which must be
 * sorted ascending and must NOT contain the item being moved).
 */
export const positionAt = (siblings: readonly number[], index: number): number => {
  const bounded = Math.max(0, Math.min(index, siblings.length));
  const before = bounded > 0 ? siblings[bounded - 1] : undefined;
  const after = bounded < siblings.length ? siblings[bounded] : undefined;

  if (before != null && after != null) return (before + after) / 2;
  if (before != null) return positionAfter(before);
  if (after != null) return positionBefore(after);
  return STEP;
};

/** True when any neighbouring pair has drifted too close to split again. */
export const needsCompaction = (positions: readonly number[]): boolean => {
  for (let i = 1; i < positions.length; i += 1) {
    if (Math.abs(positions[i]! - positions[i - 1]!) < MIN_GAP) return true;
  }
  return false;
};

/** Evenly spaced positions used when compacting a column. */
export const compact = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => (i + 1) * STEP);
