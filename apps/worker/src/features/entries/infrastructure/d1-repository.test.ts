import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { createD1EntryRepository } from './d1-repository';

const schema = readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../../migrations/021_enforce_entry_member_limit.sql', import.meta.url), 'utf8');
const userId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';
const groupIds = [
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
];
const now = '2026-09-26T00:00:00.000Z';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec('DROP TRIGGER entries_member_limit_before_insert');
  sqlite.exec(migration);
  sqlite.prepare('INSERT INTO users (id, name, email, grade, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'テスト部員', 'test@example.invalid', 1, now, now);
  sqlite.prepare(`
    INSERT INTO events (id, title, event_date, entry_deadline, setlist_deadline, group_limit, song_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(eventId, 'テスト', '2026-10-01', now, now, 1, 2, now, now);
  for (const [index, groupId] of groupIds.entries()) {
    sqlite.prepare('INSERT INTO groups (id, name, main_index, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(groupId, `バンド${index + 1}`, index, 1, now, now);
    sqlite.prepare('INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`00000000-0000-4000-8000-00000000001${index}`, groupId, userId, 'VO', now, now);
  }
  class Statement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number | null)[]) { this.values = values; return this; }
    async first<T>() { return (sqlite.prepare(this.sql).get(...this.values) ?? null) as T | null; }
    async all<T>() { return { results: sqlite.prepare(this.sql).all(...this.values) as T[] }; }
    async run() { const result = sqlite.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, repository: createD1EntryRepository(db) };
}

describe('entry member limit at the D1 boundary', () => {
  it('同じメンバーの2バンドを1枠へ同時登録すると全体をロールバックする', async () => {
    const { sqlite, repository } = setup();
    await expect(repository.create(eventId, groupIds, [
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000006',
    ], now)).rejects.toThrow('GROUP_LIMIT_EXCEEDED');
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM entries').get()).toMatchObject({ count: 0 });
    sqlite.close();
  });

  it('先に成立した申込を残し、後続の超過申込だけを拒否する', async () => {
    const { sqlite, repository } = setup();
    await repository.create(eventId, [groupIds[0]], ['00000000-0000-4000-8000-000000000005'], now);
    expect(await repository.exceededMemberNames(eventId, [groupIds[1]], 1)).toEqual(['テスト部員']);
    await expect(repository.create(eventId, [groupIds[1]], ['00000000-0000-4000-8000-000000000006'], now))
      .rejects.toThrow('GROUP_LIMIT_EXCEEDED');
    expect(sqlite.prepare('SELECT group_id FROM entries').all()).toEqual([{ group_id: groupIds[0] }]);
    sqlite.close();
  });
});
