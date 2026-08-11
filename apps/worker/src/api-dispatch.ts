import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';

export type FetchHandler<Env> = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response;
};

export type ScheduledHandler<Env> = {
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> | void;
};

export type UnifiedWorker<Env> = FetchHandler<Env> & ScheduledHandler<Env>;

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function stripApiPrefix(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = url.pathname.slice('/api'.length) || '/';
  return new Request(url, request);
}

export function createUnifiedWorker<Env>(
  nextWorker: FetchHandler<Env>,
  apiWorker: FetchHandler<Env> & ScheduledHandler<Env>,
): UnifiedWorker<Env> {
  return {
    fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (isApiPath(url.pathname)) {
        return apiWorker.fetch(stripApiPrefix(request), env, ctx);
      }

      return nextWorker.fetch(request, env, ctx);
    },
    scheduled(event, env, ctx) {
      return apiWorker.scheduled(event, env, ctx);
    },
  };
}
