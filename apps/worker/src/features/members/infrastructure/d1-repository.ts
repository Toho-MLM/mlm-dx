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
    async update(id, values, now) {
      await db.prepare(`
        UPDATE users SET nickname = ?, grade = ?, instruments = ?, role = ?, updated_at = ? WHERE id = ?
      `).bind(values.nickname, values.grade, JSON.stringify(values.instruments), values.role, now, id).run();
    },
    async moveUpGrades(now) {
      const deletion = `
        (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)
        OR (LOWER(SUBSTR(email, 1, 1)) = 'm' AND grade = 6)
      `;
      const advancement = `grade BETWEEN 1 AND 5 AND NOT (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)`;
      const deleteCount = await db.prepare(`SELECT COUNT(*) AS count FROM users WHERE ${deletion}`)
        .first<{ count: number | string }>();
      const moveCount = await db.prepare(`SELECT COUNT(*) AS count FROM users WHERE ${advancement}`)
        .first<{ count: number | string }>();
      await db.batch([
        db.prepare(`DELETE FROM users WHERE ${deletion}`),
        db.prepare(`UPDATE users SET grade = grade + 1, updated_at = ? WHERE ${advancement}`).bind(now),
      ]);
      return { deletedCount: Number(deleteCount?.count ?? 0), movedUpCount: Number(moveCount?.count ?? 0) };
    },
    async exists(id) {
      return Boolean(await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first());
    },
    async delete(id) {
      await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
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

