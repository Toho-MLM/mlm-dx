declare module '*.html' {
  const content: string
  export default content
}

declare module 'cloudflare:sockets' {
  export interface Socket {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    opened: Promise<{ localAddress: string; remoteAddress: string }>
    closed: Promise<void>
    close(): void
    startTls(options?: { expectedServerHostname?: string }): Socket
  }

  export function connect(
    address: { hostname: string; port: number },
    options?: { secureTransport?: 'off' | 'on' | 'starttls'; allowHalfOpen?: boolean },
  ): Socket
}
