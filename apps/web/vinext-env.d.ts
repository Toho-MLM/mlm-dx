/// <reference types="vinext/types" />

declare module 'cloudflare:workers' {
  export const env: {
    WORKER_SELF_REFERENCE: { fetch(request: Request): Promise<Response> }
  }
}
