import type { D1Database } from '@cloudflare/workers-types';
import { ExecutiveTransitionSchema } from '@shared-schemas';
import type { ExecutiveTransitionRepository } from '../application/service';

// 保存と実行の両方で、対象者の削除・管理者への変更を検出する。
const invalidAssignments = `EXISTS (
  SELECT 1 FROM json_each(executive_transitions.assignments) a
  LEFT JOIN users u ON u.id = json_extract(a.value, '$.user_id')
  WHERE u.id IS NULL OR u.role = 'ADM'
)`;

export function createD1ExecutiveTransitionRepository(db: D1Database): ExecutiveTransitionRepository {
  return {
    async get() {
      const row = await db.prepare(`SELECT revision, effective_date, effective_at, assignments, status, failure_reason
        FROM executive_transitions WHERE id = 1`).first<Record<string, unknown>>();
      return row ? ExecutiveTransitionSchema.parse({ ...row, assignments: JSON.parse(String(row.assignments)) }) : null;
    },
    async eligibleMemberIds() {
      const rows = await db.prepare("SELECT id FROM users WHERE role <> 'ADM'").all<{ id: string }>();
      return new Set(rows.results.map((row) => row.id));
    },
    async save(schedule, expectedRevision, now) {
      const assignments = JSON.stringify(schedule.assignments);
      const result = await db.prepare(`
        INSERT INTO executive_transitions (id, revision, effective_date, effective_at, assignments, status, failure_reason, updated_at)
        SELECT 1, ?, ?, ?, ?, 'PENDING', NULL, ?
        WHERE ((? IS NULL AND NOT EXISTS (SELECT 1 FROM executive_transitions WHERE id = 1))
          OR EXISTS (SELECT 1 FROM executive_transitions WHERE id = 1 AND revision = ?))
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) a LEFT JOIN users u ON u.id = json_extract(a.value, '$.user_id')
            WHERE u.id IS NULL OR u.role = 'ADM'
          )
        ON CONFLICT(id) DO UPDATE SET
          revision = excluded.revision, effective_date = excluded.effective_date, effective_at = excluded.effective_at,
          assignments = excluded.assignments, status = 'PENDING', failure_reason = NULL, updated_at = excluded.updated_at
        WHERE executive_transitions.revision = ?
          AND (executive_transitions.status <> 'PENDING' OR executive_transitions.effective_at > ?)
      `).bind(schedule.revision, schedule.effective_date, schedule.effective_at, assignments, now,
        expectedRevision, expectedRevision, assignments, expectedRevision, now).run();
      return result.meta.changes === 1;
    },
    async cancel(expectedRevision, now) {
      const result = await db.prepare(`UPDATE executive_transitions SET status = 'CANCELLED', updated_at = ?
        WHERE id = 1 AND revision = ? AND status = 'PENDING' AND effective_at > ?`)
        .bind(now, expectedRevision, now).run();
      return result.meta.changes === 1;
    },
    async applyDue(revision, now) {
      // batch 内の全更新を一つのトランザクションで実行。再実行・取消・変更との競合は条件で抑止。
      await db.batch([
        db.prepare(`UPDATE executive_transitions SET status = 'FAILED', failure_reason = 'MEMBER_UNAVAILABLE', updated_at = ?
          WHERE id = 1 AND revision = ? AND status = 'PENDING' AND effective_at <= ? AND ${invalidAssignments}`)
          .bind(now, revision, now),
        db.prepare(`UPDATE users SET role = COALESCE((
            SELECT json_extract(a.value, '$.role') FROM executive_transitions t, json_each(t.assignments) a
            WHERE t.id = 1 AND json_extract(a.value, '$.user_id') = users.id
          ), 'MBR'), updated_at = ?
          WHERE role <> 'ADM' AND (
            role IN ('MGR', 'CHF', 'MAC', 'NHD', 'NAC') OR id IN (
              SELECT json_extract(a.value, '$.user_id') FROM executive_transitions t, json_each(t.assignments) a WHERE t.id = 1
            )
          ) AND EXISTS (SELECT 1 FROM executive_transitions
            WHERE id = 1 AND revision = ? AND status = 'PENDING' AND effective_at <= ?)`)
          .bind(now, revision, now),
        db.prepare(`UPDATE executive_transitions SET status = 'APPLIED', updated_at = ?
          WHERE id = 1 AND revision = ? AND status = 'PENDING' AND effective_at <= ?`)
          .bind(now, revision, now),
      ]);
    },
  };
}
