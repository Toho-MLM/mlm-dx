import type { D1Database } from '@cloudflare/workers-types';
import type { MemberRepository } from '../application/repository';

function parseJson<T>(value: string | null, fallback: T): T {
  try { return JSON.parse(value || '') as T; } catch { return fallback; }
}

export function createD1MemberRepository(db: D1Database): MemberRepository {
  return {
    async list() {
      const rows = await db.prepare(`
        SELECT u.id, u.name, u.nickname, u.email, u.grade, u.instruments, u.role,
               GROUP_CONCAT(DISTINCT g.name) AS groups,
               UPPER(SUBSTR(u.email, 1, 6)) AS student_number
        FROM users u
        LEFT JOIN group_member_instruments gmi ON u.id = gmi.user_id
        LEFT JOIN groups g ON gmi.group_id = g.id AND g.is_active = TRUE
        GROUP BY u.id ORDER BY u.grade DESC, UPPER(SUBSTR(u.email, 1, 6)) ASC
      `).all<Record<string, unknown>>();
      return rows.results.map((member) => ({
        ...member,
        groups: member.groups ? String(member.groups).split(',') : [],
        instruments: parseJson(String(member.instruments ?? ''), []),
      }));
    },
    async emailExists(email) {
      return Boolean(await db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(email).first());
    },
    async existingEmails(emails) {
      if (!emails.length) return new Set();
      const placeholders = emails.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT email FROM users WHERE lower(email) IN (${placeholders})`)
        .bind(...emails).all<{ email: string }>();
      return new Set(rows.results.map((row) => row.email.toLowerCase()));
    },
    async create(member, now) {
      await db.prepare(`
        INSERT INTO users (id, name, nickname, email, grade, instruments, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(member.id, member.name, member.nickname, member.email, member.grade,
        JSON.stringify(member.instruments), member.role, now, now).run();
    },
    async findRole(id) {
      const row = await db.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{ role: string }>();
      return row?.role ?? null;
    },
    async update(id, values, now, canChangeAdmRole) {
      const result = await db.prepare(`
        UPDATE users SET nickname = ?, grade = ?, instruments = ?, role = ?, updated_at = ? WHERE id = ?
          AND (? = 1 OR role = ? OR (role <> 'ADM' AND ? <> 'ADM'))
      `).bind(values.nickname, values.grade, JSON.stringify(values.instruments), values.role, now, id,
        canChangeAdmRole ? 1 : 0, values.role, values.role).run();
      return Number(result.meta.changes ?? 0) > 0;
    },
    async moveUpGrades(now, canDeleteAdm) {
      const deletion = `
        (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)
        OR (LOWER(SUBSTR(email, 1, 1)) = 'm' AND grade = 6)
      `;
      const advancement = `grade BETWEEN 1 AND 5 AND NOT (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)`;
      const guard = `(? = 1 OR NOT EXISTS (
        SELECT 1 FROM users u WHERE (${deletion}) AND u.role = 'ADM'
      ))`;
      const permission = canDeleteAdm ? 1 : 0;
      const results = await db.batch([
        db.prepare(`SELECT ${guard} AS permitted,
          (SELECT COUNT(*) FROM users WHERE ${deletion}) AS deletedCount,
          (SELECT COUNT(*) FROM users WHERE ${advancement}) AS movedUpCount`).bind(permission),
        db.prepare(`DELETE FROM users WHERE (${deletion}) AND ${guard}`).bind(permission),
        db.prepare(`UPDATE users SET grade = grade + 1, updated_at = ? WHERE (${advancement}) AND ${guard}`).bind(now, permission),
      ]);
      const counts = results[0].results[0] as { permitted: number; deletedCount: number; movedUpCount: number };
      return counts.permitted ? { deletedCount: Number(counts.deletedCount), movedUpCount: Number(counts.movedUpCount) } : null;
    },
    async exists(id) {
      return Boolean(await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first());
    },
    async delete(id, canDeleteAdm) {
      const result = await db.prepare(`DELETE FROM users WHERE id = ? AND (? = 1 OR role <> 'ADM')`).bind(id, canDeleteAdm ? 1 : 0).run();
      return Number(result.meta.changes ?? 0) > 0;
    },
    async listForSelect(currentUserId) {
      const rows = await db.prepare(`
        SELECT u.id, u.name, u.nickname, u.instruments, u.grade,
               UPPER(SUBSTR(u.email, 1, 6)) AS student_number
        FROM users u WHERE u.name IS NOT NULL
        ORDER BY CASE WHEN u.id = ? THEN 0 ELSE 1 END,
                 u.grade DESC, UPPER(SUBSTR(u.email, 1, 6)) ASC
      `).bind(currentUserId).all<Record<string, unknown>>();
      return rows.results.map((member) => {
        const studentNumber = String(member.student_number);
        const name = String(member.name);
        const displayName = `${studentNumber} ${member.nickname || name}`;
        return {
          id: member.id,
          name: displayName,
          display_name: displayName,
          real_name: `${studentNumber} ${name}`,
          instruments: parseJson<string[]>(String(member.instruments ?? '[]'), []),
        };
      });
    },
  };
}
