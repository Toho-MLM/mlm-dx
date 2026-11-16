import { describe, expect, it } from 'vitest';
import type { Bindings } from '../index';
import {
  createRegistrationOptions, createAuthenticationOptions,
  verifyRegistration, verifyAuthentication, encodeBase64Url, decodeBase64Url,
  type StoredPasskey,
} from './passkey';

const env = { FRONTEND_URL: 'https://dx.example.test' } as Bindings;
const passkey: StoredPasskey = {
  id: 'stored-key', credential_id: 'a2V5', public_key: 'AQID_w', counter: 5,
  device_type: 'singleDevice', backed_up: 0,
  transports: '["internal","hybrid"]', attestation_format: 'none',
};

describe('パスキーライブラリの互換性', () => {
  it('既存の鍵を除外して、本人確認必須の登録オプションを生成する', async () => {
    const options = await createRegistrationOptions(env, {
      id: '会員ID', email: 'member@example.test', name: '会員',
    }, [passkey]);
    expect(options.rp.id).toBe('dx.example.test');
    expect(new TextDecoder().decode(decodeBase64Url(options.user.id))).toBe('会員ID');
    expect(options.excludeCredentials).toEqual([
      { id: 'a2V5', type: 'public-key', transports: ['internal', 'hybrid'] },
    ]);
    expect(options.authenticatorSelection?.userVerification).toBe('required');
    expect(options.attestation).toBe('none');
    expect(options.challenge).not.toBe('');
  });

  it('保存した鍵とカウンターを引き継いで認証オプションを生成する', async () => {
    const options = await createAuthenticationOptions(env, [passkey]);
    expect(options.rpId).toBe('dx.example.test');
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials).toEqual([
      { id: passkey.credential_id, type: 'public-key', transports: ['internal', 'hybrid'] },
    ]);
    const discoverable = await createAuthenticationOptions(env);
    expect(discoverable.allowCredentials ?? []).toHaveLength(0);
  });

  it.each(['registration', 'authentication'] as const)('%sで不正なchallengeとoriginを拒否する', async (kind) => {
    for (const [challenge, origin, error] of [
      ['wrong', 'https://dx.example.test', /challenge/],
      ['expected', 'https://attacker.example.test', /origin/],
    ] as const) {
      const response = {
        id: passkey.credential_id, rawId: passkey.credential_id, type: 'public-key',
        response: {
          clientDataJSON: encodeBase64Url(new TextEncoder().encode(JSON.stringify({
            type: kind === 'registration' ? 'webauthn.create' : 'webauthn.get',
            challenge, origin,
          }))),
          attestationObject: '', authenticatorData: '', signature: '',
        },
      };
      const result = kind === 'registration'
        ? verifyRegistration(env, 'expected', response)
        : verifyAuthentication(env, 'expected', response, passkey);
      await expect(result).rejects.toThrow(error);
    }
  });

  it('保存済み公開鍵の全バイトをBase64URLで保持する', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
    expect(decodeBase64Url(passkey.public_key)).toEqual(new Uint8Array([1, 2, 3, 255]));
  });
});
