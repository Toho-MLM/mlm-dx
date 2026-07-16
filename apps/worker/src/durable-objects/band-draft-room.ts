import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Bindings } from '../index';
import { DraftStateSchema } from '../band-draft-state';

type CloudflareWebSocket = WebSocket & {
  accept(): void;
};

declare const WebSocketPair: {
  new(): { 0: CloudflareWebSocket; 1: CloudflareWebSocket };
};

type WebSocketResponseInit = NonNullable<ConstructorParameters<typeof Response>[1]> & {
  webSocket: CloudflareWebSocket;
};

type DraftRow = {
  id: string;
  state_json: string;
};

type ClientMessage = {
  type: 'replace_state';
  state: unknown;
};

type ServerMessage =
  | { type: 'snapshot'; state: unknown }
  | { type: 'error'; error: string };

export class BandDraftRoom {
  private sessions = new Set<CloudflareWebSocket>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Bindings
  ) {
    void this.state;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const token = request.headers.get('x-draft-token') ?? getTokenFromRequestUrl(request.url);
    if (!token) {
      return new Response('Missing draft token', { status: 400 });
    }

    const draft = await this.fetchDraft(token);
    if (!draft) {
      return new Response('Draft not found', { status: 404 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sessions.add(server);

    this.send(server, {
      type: 'snapshot',
      state: DraftStateSchema.parse(JSON.parse(draft.state_json)),
    });

    server.addEventListener('message', (event: MessageEvent) => {
      void this.handleMessage(server, token, event.data);
    });
    server.addEventListener('close', () => this.sessions.delete(server));
    server.addEventListener('error', () => this.sessions.delete(server));

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as WebSocketResponseInit);
  }

  private async handleMessage(sender: CloudflareWebSocket, token: string, data: unknown): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(data)) as ClientMessage;
    } catch {
      this.send(sender, { type: 'error', error: 'INVALID_MESSAGE' });
      return;
    }

    if (message.type !== 'replace_state') {
      this.send(sender, { type: 'error', error: 'UNSUPPORTED_MESSAGE_TYPE' });
      return;
    }

    const draft = await this.fetchDraft(token);
    if (!draft) {
      this.send(sender, { type: 'error', error: 'DRAFT_NOT_FOUND' });
      return;
    }
    const currentState = DraftStateSchema.parse(JSON.parse(draft.state_json));
    const incomingState = DraftStateSchema.parse(message.state);
    const nextState = {
      ...incomingState,
      version: currentState.version + 1,
    };
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      UPDATE main_band_drafts
      SET state_json = ?, updated_at = ?
      WHERE id = ?
    `).bind(JSON.stringify(nextState), now, draft.id).run();

    this.broadcast({
      type: 'snapshot',
      state: nextState,
    });
  }

  private async fetchDraft(token: string): Promise<DraftRow | null> {
    return await this.env.DB.prepare(`
      SELECT id, state_json
      FROM main_band_drafts
      WHERE share_token = ?
    `).bind(token).first<DraftRow>();
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

function getTokenFromRequestUrl(url: string): string | null {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/^\/band\/main\/draft\/([^/]+)\/ws$/);
  return match ? decodeURIComponent(match[1]) : null;
}
