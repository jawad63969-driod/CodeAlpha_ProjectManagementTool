import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  Permission,
  room,
  type EventEnvelope,
  type SubscribeAck,
  type UserRefDto,
} from '@taskforge/shared';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { authRepository } from '../auth/auth.repository.js';
import { can } from '../rbac/authorize.js';
import { projectRepository } from '../modules/projects/project.repository.js';
import { setRealtimeTransport, type RealtimeTransport } from './publisher.js';
import type { AuthContext } from '../auth/context.js';

interface SocketState {
  auth: AuthContext;
  user: UserRefDto;
  projects: Set<string>;
}

const state = new WeakMap<Socket, SocketState>();

/** projectId → userId → { user, socketIds } */
const presence = new Map<string, Map<string, { user: UserRefDto; sockets: Set<string> }>>();

const viewersOf = (projectId: string): UserRefDto[] =>
  [...(presence.get(projectId)?.values() ?? [])].map((entry) => entry.user);

const addViewer = (projectId: string, user: UserRefDto, socketId: string): void => {
  const byUser = presence.get(projectId) ?? new Map();
  const entry = byUser.get(user.id) ?? { user, sockets: new Set<string>() };
  entry.sockets.add(socketId);
  byUser.set(user.id, entry);
  presence.set(projectId, byUser);
};

const removeViewer = (projectId: string, userId: string, socketId: string): void => {
  const byUser = presence.get(projectId);
  const entry = byUser?.get(userId);
  if (!byUser || !entry) return;
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) byUser.delete(userId);
  if (byUser.size === 0) presence.delete(projectId);
};

/**
 * The websocket half of the API. It authenticates with the same access token as
 * REST and re-runs the same permission check before letting a socket into a
 * project room (FR-J-01, FR-J-02) — a socket is not a back door around RBAC.
 */
export const createRealtimeGateway = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: { origin: env.clientOrigins, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.['token'];
      if (typeof token !== 'string' || token.length === 0) {
        next(new Error('UNAUTHENTICATED'));
        return;
      }

      const claims = verifyAccessToken(token);
      const user = authRepository.findUserById(claims.sub);
      if (!user || !user.isActive) {
        next(new Error('UNAUTHENTICATED'));
        return;
      }

      const membership = authRepository.findMembership(claims.org, claims.sub);
      if (!membership || membership.status !== 'ACTIVE') {
        next(new Error('FORBIDDEN'));
        return;
      }

      state.set(socket, {
        auth: {
          userId: user.id,
          organizationId: claims.org,
          orgRole: membership.role as AuthContext['orgRole'],
          sessionId: claims.sid ?? null,
          projectRoleCache: new Map(),
        },
        user: { id: user.id, name: user.name, avatarColor: user.avatarColor },
        projects: new Set(),
      });
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const current = state.get(socket);
    if (!current) {
      socket.disconnect(true);
      return;
    }

    socket.join(room.user(current.auth.userId));
    socket.join(room.org(current.auth.organizationId));
    socket.emit('ready', { userId: current.auth.userId, organizationId: current.auth.organizationId });

    socket.on('project.subscribe', (payload: { projectId?: unknown }, ack?: (result: SubscribeAck) => void) => {
      const projectId = typeof payload?.projectId === 'string' ? payload.projectId : null;
      if (!projectId) {
        ack?.({ ok: false, error: 'projectId is required' });
        return;
      }

      // Same tenant, same permission engine as the REST API.
      const project = projectRepository.findById(projectId, current.auth.organizationId);
      if (!project || !can(current.auth, Permission.PROJECT_READ, projectId)) {
        ack?.({ ok: false, error: 'You do not have access to that project' });
        return;
      }

      socket.join(room.project(projectId));
      current.projects.add(projectId);
      addViewer(projectId, current.user, socket.id);

      const viewers = viewersOf(projectId);
      io.to(room.project(projectId)).emit('event', {
        type: 'presence.updated',
        version: 1,
        actorId: current.auth.userId,
        organizationId: current.auth.organizationId,
        projectId,
        occurredAt: new Date().toISOString(),
        payload: { projectId, viewers },
      } satisfies EventEnvelope<'presence.updated'>);

      ack?.({ ok: true, viewers });
    });

    socket.on('project.unsubscribe', (payload: { projectId?: unknown }) => {
      const projectId = typeof payload?.projectId === 'string' ? payload.projectId : null;
      if (!projectId || !current.projects.has(projectId)) return;
      leaveProject(socket, current, projectId);
    });

    /** Ephemeral drag preview — never persisted, only mirrored to the room. */
    socket.on('task.dragging', (payload: { projectId?: unknown; taskId?: unknown; columnId?: unknown }) => {
      const projectId = typeof payload?.projectId === 'string' ? payload.projectId : null;
      const taskId = typeof payload?.taskId === 'string' ? payload.taskId : null;
      const columnId = typeof payload?.columnId === 'string' ? payload.columnId : null;
      if (!projectId || !taskId || !columnId || !current.projects.has(projectId)) return;

      socket.to(room.project(projectId)).emit('event', {
        type: 'task.dragging',
        version: 1,
        actorId: current.auth.userId,
        organizationId: current.auth.organizationId,
        projectId,
        occurredAt: new Date().toISOString(),
        payload: { taskId, columnId, user: current.user },
      } satisfies EventEnvelope<'task.dragging'>);
    });

    socket.on('disconnect', () => {
      for (const projectId of [...current.projects]) leaveProject(socket, current, projectId);
    });

    function leaveProject(target: Socket, socketState: SocketState, projectId: string): void {
      target.leave(room.project(projectId));
      socketState.projects.delete(projectId);
      removeViewer(projectId, socketState.auth.userId, target.id);
      io.to(room.project(projectId)).emit('event', {
        type: 'presence.updated',
        version: 1,
        actorId: socketState.auth.userId,
        organizationId: socketState.auth.organizationId,
        projectId,
        occurredAt: new Date().toISOString(),
        payload: { projectId, viewers: viewersOf(projectId) },
      } satisfies EventEnvelope<'presence.updated'>);
    }
  });

  const transport: RealtimeTransport = {
    /** Every domain event travels on one channel, discriminated by `type`. */
    emitToRoom: (roomName, event) => {
      io.to(roomName).emit('event', event);
    },
    viewersOf,
  };
  setRealtimeTransport(transport);

  logger.info('realtime gateway attached');
  return io;
};

export const stopRealtimeGateway = async (io: Server | null): Promise<void> => {
  setRealtimeTransport(null);
  presence.clear();
  if (io) await new Promise<void>((resolve) => io.close(() => resolve()));
};
