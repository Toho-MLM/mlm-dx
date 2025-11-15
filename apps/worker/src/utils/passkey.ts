import type { Bindings } from '../index';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { VerifiedRegistrationResponse, VerifiedAuthenticationResponse } from '@simplewebauthn/server';

export type StoredPasskey = {
  id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_type: string | null;
  backed_up: number | null;
  transports: string | null;
  attestation_format: string | null;
};

export function getRpID(env: Bindings): string {
  return new URL(env.FRONTEND_URL).hostname;
}

export function getOrigin(env: Bindings): string {
  const origin = new URL(env.FRONTEND_URL);
  origin.pathname = '';
  origin.hash = '';
  origin.search = '';
  return origin.toString().replace(/\/$/, '');
}

type RegistrationOptions = Awaited<ReturnType<typeof generateRegistrationOptions>>;
type AuthenticationOptions = Awaited<ReturnType<typeof generateAuthenticationOptions>>;

function parseTransports(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function encodeUserId(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export async function createRegistrationOptions(env: Bindings, user: { id: string; email: string; name: string }, passkeys: StoredPasskey[]): Promise<RegistrationOptions> {
  const excludeCredentials = passkeys.map((pk) => ({
    id: pk.credential_id,
    type: 'public-key' as const,
    transports: parseTransports(pk.transports),
  })) as unknown as RegistrationOptions['excludeCredentials'];
  return generateRegistrationOptions({
    rpID: getRpID(env),
    rpName: 'MLM DX',
    userID: encodeUserId(user.id),
    userName: user.email,
    userDisplayName: user.name,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
    attestationType: 'none',
  });
}

export async function verifyRegistration(env: Bindings, expectedChallenge: string, response: unknown): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    expectedChallenge,
    expectedOrigin: getOrigin(env),
    expectedRPID: getRpID(env),
    response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
  });
}

export async function createAuthenticationOptions(env: Bindings, passkeys: StoredPasskey[] = []): Promise<AuthenticationOptions> {
  const descriptors = passkeys.map((pk) => ({
    id: pk.credential_id,
    type: 'public-key' as const,
    transports: parseTransports(pk.transports),
  }));
  const baseOptions = {
    rpID: getRpID(env),
    userVerification: 'required' as const,
  };
  if (descriptors.length === 0) {
    return generateAuthenticationOptions(baseOptions);
  }
  return generateAuthenticationOptions({
    ...baseOptions,
    allowCredentials: descriptors as unknown as AuthenticationOptions['allowCredentials'],
  });
}

export async function verifyAuthentication(env: Bindings, expectedChallenge: string, response: unknown, passkey: StoredPasskey): Promise<VerifiedAuthenticationResponse> {
  const parsedTransports = parseTransports(passkey.transports);
  return verifyAuthenticationResponse({
    expectedChallenge,
    expectedOrigin: getOrigin(env),
    expectedRPID: getRpID(env),
    credential: {
      id: passkey.credential_id,
      publicKey: decodeBase64Url(passkey.public_key),
      counter: passkey.counter,
      transports: parsedTransports as ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid')[] | undefined,
    },
    response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function futureISO(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function encodeBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64Url(data: string): Uint8Array {
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

