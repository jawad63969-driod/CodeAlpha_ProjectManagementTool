import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket } from 'socket.io-client';
import type { EventEnvelope, ServerEventName, SubscribeAck } from '@taskforge/shared';
import { createApp } from '../../src/app.js';
import { createRealtimeGateway, stopRealtimeGateway } from '../../src/realtime/gateway.js';

export interface LiveServer {
  url: string;
  close: () => Promise<void>;
}

/** Boots the API with its websocket gateway on an ephemeral port. */
export const startLiveServer = async (): Promise<LiveServer> => {
  const server = http.createServer(createApp());
  const io = createRealtimeGateway(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await stopRealtimeGateway(io);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

/** A connected client that records every event envelope it receives. */
export class TestClient {
  readonly events: EventEnvelope[] = [];
  private constructor(readonly socket: Socket) {}

  static connect(url: string, token: string, timeoutMs = 5000): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = createClient(url, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('timed out connecting'));
      }, timeoutMs);

      const client = new TestClient(socket);
      socket.on('event', (envelope: EventEnvelope) => client.events.push(envelope));
      socket.on('ready', () => {
        clearTimeout(timer);
        resolve(client);
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        socket.close();
        reject(error);
      });
    });
  }

  subscribe(projectId: string): Promise<SubscribeAck> {
    return new Promise((resolve) => {
      this.socket.emit('project.subscribe', { projectId }, resolve);
    });
  }

  unsubscribe(projectId: string): void {
    this.socket.emit('project.unsubscribe', { projectId });
  }

  /** Waits for the first event of a type, or rejects on timeout. */
  waitFor<K extends ServerEventName>(type: K, timeoutMs = 4000): Promise<EventEnvelope<K>> {
    const existing = this.events.find((event) => event.type === type);
    if (existing) return Promise.resolve(existing as EventEnvelope<K>);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.off('event', listener);
        reject(new Error(`timed out waiting for "${type}" (saw: ${this.events.map((e) => e.type).join(', ') || 'nothing'})`));
      }, timeoutMs);

      const listener = (envelope: EventEnvelope): void => {
        if (envelope.type !== type) return;
        clearTimeout(timer);
        this.socket.off('event', listener);
        resolve(envelope as EventEnvelope<K>);
      };
      this.socket.on('event', listener);
    });
  }

  seen(type: ServerEventName): boolean {
    return this.events.some((event) => event.type === type);
  }

  clear(): void {
    this.events.length = 0;
  }

  close(): void {
    this.socket.close();
  }
}

export const settle = (ms = 250): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
