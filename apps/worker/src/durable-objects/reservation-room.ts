import type { DurableObjectState } from '@cloudflare/workers-types';

type CloudflareWebSocket = WebSocket & {
  accept(): void;
};

declare const WebSocketPair: {
  new(): { 0: CloudflareWebSocket; 1: CloudflareWebSocket };
};

type WebSocketResponseInit = NonNullable<ConstructorParameters<typeof Response>[1]> & {
  webSocket: CloudflareWebSocket;
};

type ServerMessage =
  | { type: 'connected' }
  | { type: 'reservations_changed' }
  | { type: 'reservation_limits_changed' }
  | { type: 'error'; error: string };

export class ReservationRoom {
  private sessions = new Set<CloudflareWebSocket>();

  constructor(
    private readonly state: DurableObjectState
  ) {
    void this.state;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.sessions.add(server);

      this.send(server, { type: 'connected' });

      server.addEventListener('close', () => this.sessions.delete(server));
      server.addEventListener('error', () => this.sessions.delete(server));

      return new Response(null, {
        status: 101,
        webSocket: client,
      } as WebSocketResponseInit);
    }

    if (request.method === 'POST') {
      let message: ServerMessage;
      try {
        message = (await request.json()) as ServerMessage;
      } catch {
        return new Response('Invalid message', { status: 400 });
      }

      if (message.type !== 'reservations_changed' && message.type !== 'reservation_limits_changed') {
        return new Response('Unsupported message type', { status: 400 });
      }

      this.broadcast(message);
      return new Response(null, { status: 204 });
    }

    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  private broadcast(message: ServerMessage): void {
    for (const session of this.sessions) {
      this.send(session, message);
    }
  }

  private send(session: CloudflareWebSocket, message: ServerMessage): void {
    try {
      session.send(JSON.stringify(message));
    } catch {
      this.sessions.delete(session);
    }
  }
}
