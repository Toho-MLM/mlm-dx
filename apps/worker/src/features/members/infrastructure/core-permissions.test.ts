import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { createD1MemberRepository } from './d1-repository';
import { createD1GroupRepository } from '../../groups/infrastructure/d1-repository';
import { createD1ExternalReservationRepository } from '../../reservations/infrastructure/d1-external-repository';

const schema = readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8');
const now = '2026-10-10T00:00:00.000Z';
let sqlite: DatabaseSync;
let db: D1Database;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.prepare(`INSERT INTO users (id, name, email, grade, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('user', '部員', 'm20001@example.invalid', 6, 'MBR', now, now);
  sqlite.prepare('INSERT INTO groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('group', 'バンド', now, now);
  sqlite.prepare('INSERT INTO groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('empty-group', '空バンド', now, now);
  sqlite.prepare('INSERT INTO external_studios (id, start_datetime, end_datetime, room_names, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('studio', now, '2026-10-11T00:00:00.000Z', '["部屋"]', now, now);
  class Statement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number | null)[]) { this.values = values; return this; }
    async first<T>() { return (sqlite.prepare(this.sql).get(...this.values) ?? null) as T | null; }
    async execute() {
      const statement = sqlite.prepare(this.sql);
      if (this.sql.trimStart().startsWith('SELECT')) return { results: statement.all(...this.values), meta: { changes: 0 } };
      return { results: [], meta: { changes: Number(statement.run(...this.values).changes) } };
    }
    async run() { return this.execute(); }
  }
  db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
});
afterEach(() => sqlite.close());

function addReservation(kind: 'HALL' | 'EXTERNAL') {
  if (kind === 'HALL') {
    sqlite.prepare(`INSERT INTO reservations (id, user_id, group_id, start_time, end_time, state, created_at, updated_at)
      VALUES ('reservation', 'user', 'group', ?, ?, 'CANCELLED', ?, ?)`).run(now, now, now, now);
  } else {
    sqlite.prepare(`INSERT INTO external_reservations (id, external_studio_id, room_number, user_id, group_id, start_time, end_time, state, created_at, updated_at)
      VALUES ('reservation', 'studio', 1, 'user', 'group', ?, ?, 'CANCELLED', ?, ?)`).run(now, now, now, now);
  }
}

describe('D1書き込み時のコア操作保護', () => {
  it('ADMの付与・降格は非ADMに拒否し、同じ役職のプロフィール編集は許可する', async () => {
    const repository = createD1MemberRepository(db);
    const values = { nickname: '部員', grade: 6, instruments: [], role: 'ADM' };
    expect(await repository.update('user', values, now, false)).toBe(false);
    expect(await repository.update('user', values, now, true)).toBe(true);
    expect(await repository.update('user', { ...values, role: 'MBR' }, now, false)).toBe(false);
    expect(await repository.update('user', values, now, false)).toBe(true);
    expect(await repository.update('user', { ...values, role: 'MBR' }, now, true)).toBe(true);
  });

  it('ADM削除と卒業によるADM削除を非ADMに拒否し、全体を変更しない', async () => {
    sqlite.prepare("UPDATE users SET role = 'ADM' WHERE id = 'user'").run();
    const repository = createD1MemberRepository(db);
    expect(await repository.delete('user', false)).toBe(false);
    expect(await repository.moveUpGrades(now, false)).toBeNull();
    expect(await repository.findRole('user')).toBe('ADM');
    expect(await repository.moveUpGrades(now, true)).toEqual({ deletedCount: 1, movedUpCount: 0 });
  });

  it.each(['HALL', 'EXTERNAL'] as const)('Editorは予約履歴があるメンバーを削除でき、予約も連動削除する: %s', async (kind) => {
    addReservation(kind);
    expect(await createD1MemberRepository(db).delete('user', false)).toBe(true);
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${kind === 'HALL' ? 'reservations' : 'external_reservations'}`).get()).toMatchObject({ count: 0 });
  });

  it.each(['HALL', 'EXTERNAL'] as const)('Editorは予約履歴がある卒業対象者を削除できる: %s', async (kind) => {
    addReservation(kind);
    expect(await createD1MemberRepository(db).moveUpGrades(now, false)).toEqual({ deletedCount: 1, movedUpCount: 0 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${kind === 'HALL' ? 'reservations' : 'external_reservations'}`).get()).toMatchObject({ count: 0 });
  });

  it.each(['HALL', 'EXTERNAL'] as const)('Editorによるバンド一括削除で予約も連動削除できる: %s', async (kind) => {
    addReservation(kind);
    await createD1GroupRepository(db).delete(['empty-group', 'group']);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM groups').get()).toMatchObject({ count: 0 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${kind === 'HALL' ? 'reservations' : 'external_reservations'}`).get()).toMatchObject({ count: 0 });
  });

  it('予約がない通常データの削除・学年繰上は非ADMでも可能', async () => {
    await createD1GroupRepository(db).delete(['group']);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM groups WHERE id = ?').get('group')).toMatchObject({ count: 0 });
    expect(await createD1MemberRepository(db).moveUpGrades(now, false)).toEqual({ deletedCount: 1, movedUpCount: 0 });
  });

  it('Editorによる抽選対象削除で外部予約も連動削除できる', async () => {
    addReservation('EXTERNAL');
    const repository = createD1ExternalReservationRepository(db);
    await repository.deleteStudioCascade('studio', 'EXTERNAL', now);
    expect(await repository.findStudio('studio')).toBeNull();
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM external_reservations').get()).toMatchObject({ count: 0 });
  });
});
