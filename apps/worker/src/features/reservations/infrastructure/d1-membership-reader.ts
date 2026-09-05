import type { D1Database } from '@cloudflare/workers-types';
import type { GroupMembershipReader, IdentityMember } from '../application/membership';

export function createD1GroupMembershipReader(db: D1Database): GroupMembershipReader {
  async function listGroupMemberIds(groupId: string): Promise<string[]> {
    const rows = await db.prepare(`
      SELECT DISTINCT user_id FROM group_member_instruments
      WHERE group_id = ? ORDER BY user_id ASC
    `).bind(groupId).all<{ user_id: string }>();
    return (rows.results ?? []).map((row) => row.user_id);
  }

  return {
    async isActiveGroup(groupId) {
      const row = await db.prepare('SELECT 1 FROM groups WHERE id = ? AND is_active = TRUE')
        .bind(groupId).first();
      return Boolean(row);
    },

    async isUserInGroup(userId, groupId) {
      const row = await db.prepare(`
        SELECT 1 FROM group_member_instruments WHERE user_id = ? AND group_id = ? LIMIT 1
      `).bind(userId, groupId).first();
      return Boolean(row);
    },

    listGroupMemberIds,

    async getActiveGroupIdentity(groupId) {
      const group = await db.prepare('SELECT main_index, is_active FROM groups WHERE id = ?')
        .bind(groupId).first<{ main_index: number | null; is_active: number }>();
      if (!group || !group.is_active) return null;
      const memberIds = await listGroupMemberIds(groupId);
      return memberIds.length === 0 ? null : { isMain: group.main_index !== null, memberIds };
    },

    async listIdentityMembers(userId, groupId) {
      if (!groupId) {
        const user = await db.prepare('SELECT id, COALESCE(nickname, name) AS name FROM users WHERE id = ?')
          .bind(userId).first<IdentityMember>();
        return user ? [user] : [];
      }
      const rows = await db.prepare(`
        SELECT DISTINCT u.id, COALESCE(u.nickname, u.name) AS name
        FROM group_member_instruments gm
        INNER JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ?
        ORDER BY u.id ASC
      `).bind(groupId).all<IdentityMember>();
      return rows.results ?? [];
    },
  };
}
