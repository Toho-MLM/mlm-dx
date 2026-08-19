import type { SessionTokenProvider } from '../application/session';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const webCryptoSessionTokenProvider: SessionTokenProvider = {
  generateId: () => crypto.randomUUID(),
  generateToken: () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return encodeBase64Url(bytes);
  },
  hashToken: async (token) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return encodeBase64Url(new Uint8Array(digest));
  },
};
