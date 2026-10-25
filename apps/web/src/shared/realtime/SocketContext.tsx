import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import type { EventEnvelope, SubscribeAck } from '@taskforge/shared';
import { tokens } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { applyEvent } from './applyEvent.js';
import { usePresence } from './presenceStore.js';

interface SocketValue {
  subscribe: (projectId: string) => Promise<SubscribeAck>;
  unsubscribe: (projectId: string) => void;
  reportDrag: (projectId: string, taskId: string, columnId: string) => void;
}

const SocketContext = createContext<SocketValue | null>(null);
const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      socketRef.current?.close();
      socketRef.current = null;
      usePresence.getState().reset();
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token: tokens.access() },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 700,
    });
    socketRef.current = socket;

    socket.on('connect', () => usePresence.getState().setConnected(true));
    socket.on('disconnect', () => usePresence.getState().setConnected(false));

    socket.on('event', (envelope: EventEnvelope) => {
      if (envelope.type === 'presence.updated') {
        usePresence.getState().setViewers(envelope.payload.projectId, envelope.payload.viewers);
        return;
      }
      if (envelope.type === 'task.dragging') {
        usePresence.getState().noteDrag(envelope.payload);
        return;
      }
      applyEvent(queryClient, envelope, userId);
    });

    return () => {
      socket.close();
      socketRef.current = null;
      usePresence.getState().reset();
    };
  }, [userId, queryClient]);

  const value = useMemo<SocketValue>(() => ({
    subscribe: (projectId) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'not connected' });
          return;
        }
        socket.emit('project.subscribe', { projectId }, resolve);
      }),
    unsubscribe: (projectId) => socketRef.current?.emit('project.unsubscribe', { projectId }),
    reportDrag: (projectId, taskId, columnId) =>
      socketRef.current?.emit('task.dragging', { projectId, taskId, columnId }),
  }), []);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = (): SocketValue => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside <SocketProvider>');
  return context;
};

/**
 * Subscribes to a project's room for as long as the component is mounted, and
 * re-subscribes after a reconnect. Board state is refetched rather than replayed
 * (ADR-007), which the query client does for us on invalidation.
 */
export const useProjectSubscription = (projectId: string | undefined): void => {
  const { subscribe, unsubscribe } = useSocket();
  const connected = usePresence((state) => state.connected);

  useEffect(() => {
    if (!projectId || !connected) return undefined;
    void subscribe(projectId);
    return () => unsubscribe(projectId);
  }, [projectId, connected, subscribe, unsubscribe]);
};
