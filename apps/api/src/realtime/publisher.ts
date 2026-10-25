import { room, type EventEnvelope, type ServerEventName, type ServerEventPayloads, type UserRefDto } from '@taskforge/shared';
import { nowIso } from '../core/result.js';

/**
 * Services depend on this interface, never on Socket.IO. That is what lets the
 * transport change — single process today, Redis adapter behind several
 * instances tomorrow (NFR-04) — without touching a line of business logic.
 */
export interface RealtimeTransport {
  emitToRoom(roomName: string, event: EventEnvelope): void;
  viewersOf(projectId: string): UserRefDto[];
}

/** Until the gateway starts, publishing is a no-op — tests can run without it. */
const noopTransport: RealtimeTransport = {
  emitToRoom: () => undefined,
  viewersOf: () => [],
};

let transport: RealtimeTransport = noopTransport;

export const setRealtimeTransport = (next: RealtimeTransport | null): void => {
  transport = next ?? noopTransport;
};

export interface EventOrigin {
  actorId: string;
  organizationId: string;
  projectId: string | null;
}

/**
 * Builds an envelope for one event type.
 *
 * The assertion is the one place a cast is warranted: `type` and `payload` are
 * constructed together from the same `K`, so the pair is correct by
 * construction, but TypeScript cannot prove that a value built from a generic
 * `K` inhabits the full discriminated union.
 */
const envelope = <K extends ServerEventName>(
  type: K,
  origin: EventOrigin,
  payload: ServerEventPayloads[K],
): EventEnvelope =>
  ({
    type,
    version: 1,
    actorId: origin.actorId,
    organizationId: origin.organizationId,
    projectId: origin.projectId,
    occurredAt: nowIso(),
    payload,
  }) as EventEnvelope;

/**
 * Every publish happens AFTER its transaction commits. Emitting from inside one
 * would show other people a change that a rollback then erased.
 */
export const publish = {
  toProject<K extends ServerEventName>(origin: EventOrigin & { projectId: string }, type: K, payload: ServerEventPayloads[K]): void {
    transport.emitToRoom(room.project(origin.projectId), envelope(type, origin, payload));
  },

  toUser<K extends ServerEventName>(userId: string, origin: EventOrigin, type: K, payload: ServerEventPayloads[K]): void {
    transport.emitToRoom(room.user(userId), envelope(type, origin, payload));
  },

  toOrg<K extends ServerEventName>(origin: EventOrigin, type: K, payload: ServerEventPayloads[K]): void {
    transport.emitToRoom(room.org(origin.organizationId), envelope(type, origin, payload));
  },

  viewersOf: (projectId: string): UserRefDto[] => transport.viewersOf(projectId),
};
