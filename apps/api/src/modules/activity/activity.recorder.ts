import type { EntityType } from '@taskforge/shared';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { activities } from '../../db/schema.js';
import type { Executor } from '../../db/client.js';

export interface ActivityInput {
  organizationId: string;
  projectId?: string | null;
  actorId: string;
  entityType: EntityType;
  entityId: string;
  action: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Writes one audit row (FR-I-01). It takes an executor rather than opening its
 * own transaction on purpose: an audit entry must commit with the mutation it
 * describes, or not at all. There is deliberately no update or delete path —
 * the trail is append-only (FR-I-02).
 */
export const recordActivity = (tx: Executor, input: ActivityInput): string => {
  const id = newId(ID_PREFIX.activity);
  tx.insert(activities)
    .values({
      id,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changesJson: JSON.stringify(input.changes ?? {}),
    })
    .run();
  return id;
};

/** Builds a `{ field: { from, to } }` diff, skipping fields that did not move. */
export const diff = <T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> => {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const previous = before[key];
    if (previous !== next) changes[key] = { from: previous, to: next };
  }
  return changes;
};
