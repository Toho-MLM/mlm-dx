import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import type { ExecutiveTransition } from '@shared-schemas';
import { createD1ExecutiveTransitionRepository } from './d1-repository';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const before = '2026-10-31T14:59:59.999Z';
const at = '2026-10-31T15:00:00.000Z';
const schema = readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../../migrations/023_add_executive_transitions.sql', import.meta.url), 'utf8');
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  sqlite.exec(schema);
  const roles = ['ADM', 'MGR', 'CHF', 'MAC', 'NHD', 'NAC', 'MBR', 'MBR'];
  roles.forEach((role, index) => sqlite.prepare('INSERT INTO users (id, name, email, grade, role, created_at, updated_at) VALUES (?, ?, ?, 2, ?, ?, ?)')
    .run(id(index + 1), `Member ${index + 1}`, `member${index}@example.invalid`, role, before, before));
  class Statement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number | null)[]) { this.values = values; return this; }
    async first<T>() { return (sqlite.prepare(this.sql).get(...this.values) ?? null) as T | null; }
    async all<T>() { return { results: sqlite.prepare(this.sql).all(...this.values) as T[] }; }
    async run() { return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.values).changes) } }; }
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
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  const rolesNow = () => sqlite.prepare('SELECT role FROM users ORDER BY id').all().map((row) => row.role);
  return { sqlite, repository: createD1ExecutiveTransitionRepository(db), rolesNow };
}
const scheduled = (n = 20): ExecutiveTransition => ({
  revision: id(n), effective_date: '2026-11-01', effective_at: at,
  assignments: [{ user_id: id(7), role: 'MGR' }, { user_id: id(8), role: 'CHF' }, { user_id: id(4), role: 'MAC' }],
  status: 'PENDING', failure_reason: null,
});
describe('幹部交代 D1 repository', () => {
  it('migrationは既存データを保持し、schemaとも一致する', () => {
    const { sqlite, rolesNow } = setup();
    const original = rolesNow();
    const initialColumns = sqlite.prepare('PRAGMA table_info(executive_transitions)').all();
    sqlite.exec('DROP TABLE executive_transitions');
    sqlite.exec(migration);
    expect(sqlite.prepare('PRAGMA table_info(executive_transitions)').all()).toEqual(initialColumns);
    sqlite.exec(migration);
    expect(rolesNow()).toEqual(original);
  });
  it('0時に全幹部を一括交代し、管理者を維持し、再実行では戻さない', async () => {
    const { repository, rolesNow, sqlite } = setup();
    const original = rolesNow();
    expect(await repository.save(scheduled(), null, before)).toBe(true);
    await repository.applyDue(id(20), before);
    expect(rolesNow()).toEqual(original);
    await repository.applyDue(id(20), at);
    expect(rolesNow()).toEqual(['ADM', 'MBR', 'MBR', 'MAC', 'MBR', 'MBR', 'MGR', 'CHF']);
    expect((await repository.get())?.status).toBe('APPLIED');
    sqlite.prepare("UPDATE users SET role = 'NHD' WHERE id = ?").run(id(5));
    await repository.applyDue(id(20), at);
    expect(rolesNow()[4]).toBe('NHD');
    expect(await repository.cancel(id(20), at)).toBe(false);
  });
  it('同時登録、古い版の編集・取消・実行を抑止する', async () => {
    const { repository, rolesNow } = setup();
    const original = rolesNow();
    expect(await repository.save(scheduled(), id(99), before)).toBe(false);
    expect(await repository.save(scheduled(), null, before)).toBe(true);
    expect(await repository.save(scheduled(21), null, before)).toBe(false);
    expect(await repository.save(scheduled(21), id(20), before)).toBe(true);
    expect(await repository.cancel(id(20), before)).toBe(false);
    await repository.applyDue(id(20), at);
    expect(rolesNow()).toEqual(original);
    expect(await repository.cancel(id(21), before)).toBe(true);
    await repository.applyDue(id(21), at);
    expect(rolesNow()).toEqual(original);
    expect(await repository.save(scheduled(22), id(21), before)).toBe(true);
  });
  it('開始時刻以降の予定変更と取消を拒否する', async () => {
    const { repository } = setup();
    await repository.save(scheduled(), null, before);
    expect(await repository.save(scheduled(21), id(20), at)).toBe(false);
    expect(await repository.cancel(id(20), at)).toBe(false);
  });
  it.each(['delete', 'admin'])('予約後に対象者が不適格になれば全員の役職を維持する: %s', async (change) => {
    const { repository, rolesNow, sqlite } = setup();
    await repository.save(scheduled(), null, before);
    if (change === 'delete') sqlite.prepare('DELETE FROM users WHERE id = ?').run(id(7));
    else sqlite.prepare("UPDATE users SET role = 'ADM' WHERE id = ?").run(id(7));
    const original = rolesNow();
    await repository.applyDue(id(20), at);
    expect(rolesNow()).toEqual(original);
    expect(await repository.get()).toMatchObject({ status: 'FAILED', failure_reason: 'MEMBER_UNAVAILABLE' });
  });
  it('保存時も管理者・存在しない対象者を拒否する', async () => {
    const { repository } = setup();
    for (const user_id of [id(1), id(99)]) {
      expect(await repository.save({ ...scheduled(), assignments: [{ user_id, role: 'MGR' }] }, null, before)).toBe(false);
    }
    expect(await repository.get()).toBeNull();
  });
  it('途中でSQLが失敗した場合は役職と予定の両方をロールバックする', async () => {
    const { repository, rolesNow, sqlite } = setup();
    const original = rolesNow();
    await repository.save(scheduled(), null, before);
    sqlite.exec("CREATE TRIGGER fail_transition BEFORE UPDATE OF role ON users WHEN NEW.id = '" + id(8) + "' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await expect(repository.applyDue(id(20), at)).rejects.toThrow('test failure');
    expect(rolesNow()).toEqual(original);
    expect((await repository.get())?.status).toBe('PENDING');
  });
});
