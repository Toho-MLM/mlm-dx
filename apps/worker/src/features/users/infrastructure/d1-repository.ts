import type { D1Database } from '@cloudflare/workers-types';
import type { EmailPreferences, UserRepository } from '../application/repository';

type PreferenceRow = {
  reservation_received: number;
  reservation_confirmed: number;
  reservation_edited: number;
  reservation_adjusted: number;
  reservation_declined: number;
  reservation_cancelled: number;
  reservation_revoked: number;
};

export function createD1UserRepository(db: D1Database): UserRepository {
  return {
    async listSelectableGroups(userId, includeAll) {
      const query = includeAll ? `
        SELECT DISTINCT g.id, g.name, g.is_main FROM groups g
        WHERE g.is_active = TRUE ORDER BY g.is_main DESC, g.created_at DESC
      ` : `
        SELECT DISTINCT g.id, g.name, g.is_main FROM groups g
        JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? AND g.is_active = TRUE
        ORDER BY g.is_main DESC, g.created_at DESC
      `;
      const result = includeAll
        ? await db.prepare(query).all<Record<string, unknown>>()
        : await db.prepare(query).bind(userId).all<Record<string, unknown>>();
      return result.results.map((group) => ({ ...group, is_main: Boolean(group.is_main) }));
    },
    async findEmailPreferences(userId) {
      const row = await db.prepare(`
        SELECT
          email_notification_preference_code % 2 = 0 AS reservation_received,
          email_notification_preference_code % 3 = 0 AS reservation_confirmed,
          email_notification_preference_code % 5 = 0 AS reservation_edited,
          email_notification_preference_code % 7 = 0 AS reservation_adjusted,
          email_notification_preference_code % 11 = 0 AS reservation_declined,
          email_notification_preference_code % 13 = 0 AS reservation_cancelled,
          email_notification_preference_code % 17 = 0 AS reservation_revoked
        FROM users WHERE id = ?
      `).bind(userId).first<PreferenceRow>();
      if (!row) return null;
      return Object.fromEntries(Object.entries({
        RESERVATION_RECEIVED: row.reservation_received,
        RESERVATION_CONFIRMED: row.reservation_confirmed,
        RESERVATION_EDITED: row.reservation_edited,
        RESERVATION_ADJUSTED: row.reservation_adjusted,
        RESERVATION_DECLINED: row.reservation_declined,
        RESERVATION_CANCELLED: row.reservation_cancelled,
        RESERVATION_REVOKED: row.reservation_revoked,
      }).map(([key, value]) => [key, Boolean(value)])) as EmailPreferences;
    },
    async updateEmailPreference(userId, prime, enabled, updatedAt) {
      const operation = enabled ? `
        CASE WHEN email_notification_preference_code % ? = 0
          THEN email_notification_preference_code ELSE email_notification_preference_code * ? END
      ` : `
        CASE WHEN email_notification_preference_code % ? = 0
          THEN email_notification_preference_code / ? ELSE email_notification_preference_code END
      `;
      await db.prepare(`
        UPDATE users SET email_notification_preference_code = ${operation}, updated_at = ? WHERE id = ?
      `).bind(prime, prime, updatedAt, userId).run();
    },
    async updateProfile(email, nickname, instruments, updatedAt) {
      await db.prepare('UPDATE users SET nickname = ?, instruments = ?, updated_at = ? WHERE email = ?')
        .bind(nickname, JSON.stringify(instruments), updatedAt, email).run();
    },
    async resetAvatar(userId, updatedAt) {
      await db.prepare('UPDATE users SET avatar = NULL, updated_at = ? WHERE id = ?')
        .bind(updatedAt, userId).run();
    },
  };
}

