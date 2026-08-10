import type { D1Database } from '@cloudflare/workers-types';
import type { AuthRepository, PasskeyChallengeRow, PasskeyRow, UserRow } from '../application/repository';

export function createD1AuthRepository(db: D1Database): AuthRepository {
  return {
    async findUserById(id) { return await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>(); },
    async findUserByEmail(email) { return await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>(); },
    async updateGoogleProfile(email, values, now) {
      if (values.name !== undefined && values.avatar !== undefined) {
        await db.prepare('UPDATE users SET name = ?, avatar = ?, updated_at = ? WHERE email = ?')
          .bind(values.name, values.avatar, now, email).run();
      } else if (values.name !== undefined) {
        await db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE email = ?').bind(values.name, now, email).run();
      } else if (values.avatar !== undefined) {
        await db.prepare('UPDATE users SET avatar = ?, updated_at = ? WHERE email = ?').bind(values.avatar, now, email).run();
      }
    },
    async listPasskeys(userId) {
      const rows = await db.prepare('SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at DESC')
        .bind(userId).all<PasskeyRow>();
      return rows.results;
    },
    async findPasskeyByCredential(credentialId) {
      return await db.prepare('SELECT * FROM passkeys WHERE credential_id = ?').bind(credentialId).first<PasskeyRow>();
    },
    async findChallenge(id) {
      return await db.prepare('SELECT * FROM passkey_challenges WHERE id = ?').bind(id).first<PasskeyChallengeRow>();
    },
    async deleteChallenge(id) { await db.prepare('DELETE FROM passkey_challenges WHERE id = ?').bind(id).run(); },
    async deleteExpiredChallenges(now) { await db.prepare('DELETE FROM passkey_challenges WHERE expires_at < ?').bind(now).run(); },
    async deleteChallenges(userId, type) {
      await db.prepare('DELETE FROM passkey_challenges WHERE user_id = ? AND type = ?').bind(userId, type).run();
    },
    async createChallenge(challenge) {
      await db.prepare(`
        INSERT INTO passkey_challenges (id, user_id, email, challenge, type, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(challenge.id, challenge.user_id, challenge.email, challenge.challenge,
        challenge.type, challenge.expires_at, challenge.created_at).run();
    },
    async upsertPasskey(passkey, now, createId) {
      const existing = await db.prepare('SELECT id FROM passkeys WHERE credential_id = ?')
        .bind(passkey.credential_id).first<{ id: string }>();
      if (existing) {
        await db.prepare(`
          UPDATE passkeys SET user_id = ?, public_key = ?, counter = ?, device_type = ?, backed_up = ?,
            transports = ?, attestation_format = ?, updated_at = ? WHERE credential_id = ?
        `).bind(passkey.user_id, passkey.public_key, passkey.counter, passkey.device_type,
          passkey.backed_up, passkey.transports, passkey.attestation_format, now, passkey.credential_id).run();
      } else {
        await db.prepare(`
          INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, device_type, backed_up,
            transports, attestation_format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(createId(), passkey.user_id, passkey.credential_id, passkey.public_key, passkey.counter,
          passkey.device_type, passkey.backed_up, passkey.transports, passkey.attestation_format, now, now).run();
      }
    },
    async updatePasskeyCounter(id, counter, now) {
      await db.prepare('UPDATE passkeys SET counter = ?, updated_at = ? WHERE id = ?').bind(counter, now, id).run();
    },
    async deletePasskey(id, userId) {
      const result = await db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(id, userId).run();
      return Number(result.meta.changes ?? 0) > 0;
    },
    async userCount() {
      const row = await db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
      return Number(row?.count ?? 0);
    },
    async emailExists(email) {
      return Boolean(await db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(email).first());
    },
    async createFirstUser(input, now) {
      const result = await db.prepare(`
        INSERT INTO users (id, name, nickname, email, grade, instruments, role, created_at, updated_at)
        SELECT ?, ?, NULL, ?, ?, '[]', 'ADM', ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)
      `).bind(input.id, input.name, input.email, input.grade, now, now).run();
      return Number(result.meta.changes ?? 0) > 0;
    },
  };
}

