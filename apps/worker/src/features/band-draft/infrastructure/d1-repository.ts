import type { D1Database } from '@cloudflare/workers-types';
import type { BandDraftRepository, DraftRow } from '../application/repository';

function parseInstruments(value: string): string[] {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

export function createD1BandDraftRepository(db: D1Database): BandDraftRepository {
  return {
    async findByToken(token) {
      return await db.prepare(`
        SELECT id, share_token, state_json, created_by FROM main_band_drafts
        WHERE share_token = ? AND id = (SELECT id FROM main_band_drafts ORDER BY created_at DESC LIMIT 1)
      `).bind(token).first<DraftRow>();
    },
    async findLatest() {
      return await db.prepare(`SELECT id, share_token, state_json, created_by FROM main_band_drafts ORDER BY created_at DESC LIMIT 1`)
        .first<DraftRow>();
    },
    async deleteExcept(id) {
      await db.prepare('DELETE FROM main_band_drafts WHERE id != ?').bind(id).run();
    },
    async listMembers() {
      const rows = await db.prepare(`
        SELECT id, name, nickname, instruments, UPPER(SUBSTR(email, 1, 6)) AS student_number
        FROM users ORDER BY grade DESC, UPPER(SUBSTR(email, 1, 6)) ASC
      `).all<{ id: string; name: string; nickname: string | null; instruments: string; student_number: string }>();
      return rows.results.map((row) => ({
        id: row.id, name: `${row.student_number} ${row.nickname || row.name}`, instruments: parseInstruments(row.instruments),
      }));
    },
    async create(draft, now) {
      await db.prepare(`
        INSERT INTO main_band_drafts (id, share_token, state_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(draft.id, draft.share_token, draft.state_json, draft.created_by, now, now).run();
    },
    async membersExist(ids) {
      if (!ids.length) return true;
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`).bind(...ids).all<{ id: string }>();
      return rows.results.length === ids.length;
    },
    async finalize(draft, groups, now, createId) {
      const statements = groups.flatMap((group) => [
        db.prepare(`
          INSERT INTO groups (id, name, is_main, is_active, created_at, updated_at)
          SELECT ?, ?, TRUE, TRUE, ?, ? WHERE EXISTS (
            SELECT 1 FROM main_band_drafts WHERE id = ? AND state_json = ?)
        `).bind(group.id, group.name, now, now, draft.id, draft.state_json),
        ...group.assignments.map((assignment) => db.prepare(`
          INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM groups WHERE id = ?)
        `).bind(createId(), group.id, assignment.memberId, assignment.instrument, now, now, group.id)),
      ]);
      statements.push(db.prepare('DELETE FROM main_band_drafts WHERE id = ? AND state_json = ?').bind(draft.id, draft.state_json));
      const results = await db.batch(statements);
      return Number(results.at(-1)?.meta.changes ?? 0) > 0;
    },
    async delete(id) {
      await db.prepare('DELETE FROM main_band_drafts WHERE id = ?').bind(id).run();
    },
    async updateState(id, currentJson, nextJson, now) {
      const result = await db.prepare(`
        UPDATE main_band_drafts SET state_json = ?, updated_at = ? WHERE id = ? AND state_json = ?
      `).bind(nextJson, now, id, currentJson).run();
      return Number(result.meta.changes ?? 0) > 0;
    },
    async deleteOlderThan(cutoff) {
      await db.prepare('DELETE FROM main_band_drafts WHERE created_at < ?').bind(cutoff).run();
    },
  };
}

