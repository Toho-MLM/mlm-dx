import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';
import { createUnifiedWorker, isApiPath, stripApiPrefix } from './api-dispatch';

const ctx = {} as ExecutionContext;
const env = { marker: 'env' };

describe('unified worker API dispatch', () => {
  it.each([
    ['/api', true],
    ['/api/auth/session', true],
    ['/apiary', false],
    ['/auth/session', false],
    ['/', false],
  ])('classifies %s', (pathname, expected) => {
    expect(isApiPath(pathname)).toBe(expected);
  });

  it('removes the prefix once while preserving query, body, cookies, and upgrade headers', async () => {
    const original = new Request('https://dx.example/api/auth/callback/google?code=abc&state=xyz', {
      method: 'POST',
      headers: {
        cookie: '__Host-mlm_dx_session=token',
        upgrade: 'websocket',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ hello: 'world' }),
    });

    const rewritten = stripApiPrefix(original);

    expect(rewritten.url).toBe('https://dx.example/auth/callback/google?code=abc&state=xyz');
    expect(rewritten.method).toBe('POST');
    expect(rewritten.headers.get('cookie')).toBe('__Host-mlm_dx_session=token');
    expect(rewritten.headers.get('upgrade')).toBe('websocket');
    expect(await rewritten.json()).toEqual({ hello: 'world' });
  });

  it('sends only /api routes to Hono and leaves old public routes to Next', async () => {
    const nextFetch = vi.fn(async () => new Response('next', { status: 404 }));
    const apiFetch = vi.fn(async (request: Request) => new Response(new URL(request.url).pathname));
    const scheduled = vi.fn(async () => undefined);
    const worker = createUnifiedWorker(
      { fetch: nextFetch },
      { fetch: apiFetch, scheduled },
    );

    const apiResponse = await worker.fetch(new Request('https://dx.example/api/reservations/ws'), env, ctx);
    expect(await apiResponse.text()).toBe('/reservations/ws');
    expect(apiFetch).toHaveBeenCalledOnce();

    const oldResponse = await worker.fetch(new Request('https://dx.example/auth/session'), env, ctx);
    expect(oldResponse.status).toBe(404);
    expect(nextFetch).toHaveBeenCalledOnce();
  });

  it('delegates scheduled events to the API worker', async () => {
    const scheduled = vi.fn(async () => undefined);
    const worker = createUnifiedWorker(
      { fetch: async () => new Response('next') },
      { fetch: async () => new Response('api'), scheduled },
    );
    const event = { cron: '0 12 * * *' } as ScheduledEvent;

    await worker.scheduled(event, env, ctx);

    expect(scheduled).toHaveBeenCalledWith(event, env, ctx);
  });
});
