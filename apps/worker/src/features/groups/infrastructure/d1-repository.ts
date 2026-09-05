import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { GroupRepository } from '../application/repository';

function assignmentStatements(db: D1Database, groupId: string, assignments: Record<string, string[]>, now: string, createId: () => string): D1PreparedStatement[] {
  return Object.entries(assignments).flatMap(([instrument, userIds]) => userIds.map((userId) => db.prepare(`
    INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(createId(), groupId, userId, instrument, now, now)));
}

export function createD1GroupRepository(db: D1Database): GroupRepository {
  return {
    async usersExist(userIds) {
      if (!userIds.length) return true;
      const placeholders = userIds.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
        .bind(...userIds).all<{ id: string }>();
      return rows.results.length === userIds.length;
    },
    async isUserInGroup(userId, groupId) {
      return Boolean(await db.prepare(`
        SELECT 1 FROM groups g JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? AND g.id = ? AND g.is_active = TRUE LIMIT 1
      `).bind(userId, groupId).first());
    },
    async getUserGroupIds(userId) {
      const rows = await db.prepare(`
        SELECT DISTINCT g.id FROM groups g
        JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? AND g.is_active = TRUE
      `).bind(userId).all<{ id: string }>();
      return rows.results.map((group) => group.id);
    },
    async create(id, name, mainIndex, assignments, now, createId) {
      await db.batch([
        db.prepare(`
          INSERT INTO groups (id, name, main_index, is_active, created_at, updated_at)
          VALUES (
            ?, ?,
            CASE WHEN ? IS NULL THEN NULL ELSE (SELECT COALESCE(MAX(main_index) + 1, 0) FROM groups) END,
            TRUE, ?, ?
          )
        `).bind(id, name, mainIndex, now, now),
        ...assignmentStatements(db, id, assignments, now, createId),
      ]);
    },
    async list(userId, mode) {
      const query = mode === 'main' ? `
        SELECT DISTINCT g.* FROM groups g WHERE g.main_index IS NOT NULL AND g.is_active = TRUE
        ORDER BY g.main_index ASC
      ` : mode === 'admin' ? `
        SELECT DISTINCT g.* FROM groups g ORDER BY g.created_at DESC, g.id DESC
      ` : `
        SELECT DISTINCT g.* FROM groups g JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? ORDER BY g.created_at DESC, g.id DESC
      `;
      const groups = mode === 'member'
        ? await db.prepare(query).bind(userId).all<Record<string, unknown>>()
        : await db.prepare(query).all<Record<string, unknown>>();
      return Promise.all(groups.results.map(async (group) => {
        const rows = await db.prepare('SELECT instrument, user_id FROM group_member_instruments WHERE group_id = ?')
          .bind(group.id).all<{ instrument: string; user_id: string }>();
        const memberMap: Record<string, string[]> = {};
        for (const row of rows.results) (memberMap[row.user_id] ??= []).push(row.instrument);
        return {
          ...group,
          main_index: group.main_index === null ? null : Number(group.main_index),
          is_active: Boolean(group.is_active),
          assignments: Object.entries(memberMap).map(([id, instruments]) => ({ id, instruments })),
        };
      }));
    },
    async findState(groupId) {
      const row = await db.prepare('SELECT id, main_index, is_active FROM groups WHERE id = ?')
        .bind(groupId).first<{ id: string; main_index: number | null; is_active: number }>();
      return row ? {
        id: row.id,
        mainIndex: row.main_index === null ? null : Number(row.main_index),
        isActive: Boolean(row.is_active),
      } : null;
    },
    async update(id, name, mainIndex, isActive, assignments, now, createId) {
      const statements = [db.prepare(`
        UPDATE groups
        SET name = ?,
            main_index = CASE
              WHEN ? IS NULL THEN NULL
              WHEN main_index IS NOT NULL THEN main_index
              ELSE (SELECT COALESCE(MAX(main_index) + 1, 0) FROM groups)
            END,
            is_active = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(name, mainIndex, isActive ? 1 : 0, now, id)];
      if (assignments) statements.push(
        db.prepare('DELETE FROM group_member_instruments WHERE group_id = ?').bind(id),
        ...assignmentStatements(db, id, assignments, now, createId),
      );
      await db.batch(statements);
    },
    async listActiveMainGroupIds() {
      const rows = await db.prepare(`
        SELECT id FROM groups
        WHERE main_index IS NOT NULL AND is_active = TRUE
        ORDER BY main_index ASC
      `).all<{ id: string }>();
      return rows.results.map((group) => group.id);
    },
    async reorderMainGroups(activeGroupIds, updatedAt) {
      const inactiveRows = await db.prepare(`
        SELECT id FROM groups
        WHERE main_index IS NOT NULL AND is_active = FALSE
        ORDER BY main_index ASC
      `).all<{ id: string }>();
      const orderedIds = [...activeGroupIds, ...inactiveRows.results.map((group) => group.id)];
      if (!orderedIds.length) return;
      const placeholders = orderedIds.map(() => '?').join(',');

      await db.batch([
        db.prepare(`
          UPDATE groups SET main_index = NULL
          WHERE main_index IS NOT NULL AND id IN (${placeholders})
        `).bind(...orderedIds),
        ...orderedIds.map((id, index) => db.prepare(`
          UPDATE groups SET main_index = ?, updated_at = ? WHERE id = ?
        `).bind(index, updatedAt, id)),
      ]);
    },
    async setActive(ids, isActive, updatedAt) {
      if (!ids.length) return false;
      const placeholders = ids.map(() => '?').join(',');
      const result = await db.prepare(`
        UPDATE groups SET is_active = ?, updated_at = ?
        WHERE id IN (${placeholders})
          AND ? = (SELECT COUNT(*) FROM groups WHERE id IN (${placeholders}))
      `).bind(isActive ? 1 : 0, updatedAt, ...ids, ids.length, ...ids).run();
      return Number(result.meta.changes ?? 0) === ids.length;
    },
    async allExist(ids) {
      if (!ids.length) return true;
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT id FROM groups WHERE id IN (${placeholders})`)
        .bind(...ids).all<{ id: string }>();
      return rows.results.length === ids.length;
    },
    async delete(ids) {
      if (!ids.length) return;
      const placeholders = ids.map(() => '?').join(',');
      await db.batch([
        db.prepare(`DELETE FROM setlist_items WHERE entry_id IN (SELECT id FROM entries WHERE group_id IN (${placeholders}))`).bind(...ids),
        db.prepare(`DELETE FROM entries WHERE group_id IN (${placeholders})`).bind(...ids),
        db.prepare(`DELETE FROM external_reservations WHERE group_id IN (${placeholders})`).bind(...ids),
        db.prepare(`DELETE FROM reservations WHERE group_id IN (${placeholders})`).bind(...ids),
        db.prepare(`DELETE FROM group_member_instruments WHERE group_id IN (${placeholders})`).bind(...ids),
        db.prepare(`DELETE FROM groups WHERE id IN (${placeholders})`).bind(...ids),
      ]);
    },
  };
}
