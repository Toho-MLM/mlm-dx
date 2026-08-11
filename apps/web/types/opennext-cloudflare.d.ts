declare module '@opennextjs/cloudflare' {
  export function defineCloudflareConfig<T = unknown>(config?: T): any;
  export function getCloudflareContext(): {
    env: {
      WORKER_SELF_REFERENCE?: {
        fetch(request: Request): Promise<Response>;
      };
    };
  };
}

