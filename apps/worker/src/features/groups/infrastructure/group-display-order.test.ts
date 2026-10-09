import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { GetTimelineResponseSchema } from '@shared-schemas';
import { createD1GroupRepository } from './d1-repository';
import { createD1TimelineRepository } from '../../timeline/infrastructure/d1-repository';
import { createD1DashboardRepository } from '../../dashboard/infrastructure/d1-repository';

const schema = readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8');
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const now = '2026-10-01T00:00:00.000Z';
const userId = id(1);
const eventId = id(20);
const implicitEventId = id(21);
const window = { nowIso: now, horizonIso: '2026-10-15T00:00:00.000Z', todayJst: '2026-10-01', horizonDateJst: '2026-10-15', limit: 5 };
const groups = [
  { id: id(2), mainIndex: 1, createdAt: '2026-09-26T00:00:00.000Z' },
  { id: id(3), mainIndex: 0, createdAt: '2026-09-30T00:00:00.000Z' },
  { id: id(4), mainIndex: null, createdAt: '2026-09-29T00:00:00.000Z' },
  { id: id(5), mainIndex: null, createdAt: '2026-09-27T00:00:00.000Z' },
  { id: id(6), mainIndex: null, createdAt: '2026-09-28T00:00:00.000Z' },
  { id: id(7), mainIndex: null, createdAt: '2026-09-29T00:00:00.000Z' },
];
const expectedGroupIds = [id(3), id(2), id(5), id(6), id(4), id(7)];

describe('band display order across D1 repositories', () => {
  let sqlite: DatabaseSync;
  let db: D1Database;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schema);
    sqlite.prepare('INSERT INTO users (id, name, email, grade, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'テスト部員', 'test@example.invalid', 1, now, now);
    for (const [index, group] of groups.entries()) {
      sqlite.prepare('INSERT INTO groups (id, name, main_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(group.id, `バンド${index + 1}`, group.mainIndex, group.createdAt, now);
      sqlite.prepare('INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id(10 + index), group.id, userId, 'VO', now, now);
    }
    for (const [event, deadline] of [[eventId, '2026-10-04T00:00:00.000Z'], [implicitEventId, '2026-10-08T00:00:00.000Z']]) {
      sqlite.prepare(`
        INSERT INTO events (id, title, event_date, entry_deadline, setlist_deadline, group_limit, song_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(event, 'テスト', '2026-10-10', now, deadline, 0, 2, now, now);
    }
    // エントリー作成日時はバンド作成日時と逆順にして、バンド側の日時を検証する。
    groups.forEach((group, index) => {
      sqlite.prepare('INSERT INTO entries (id, event_id, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(id(30 + index), eventId, group.id, `2026-09-${30 - index}T00:00:00.000Z`, now);
    });
    class Statement {
      values: (string | number | null)[] = [];
      constructor(readonly sql: string) {}
      bind(...values: (string | number | null)[]) { this.values = values; return this; }
      async all<T>() { return { results: sqlite.prepare(this.sql).all(...this.values) as T[] }; }
    }
    db = { prepare: (sql: string) => new Statement(sql) } as unknown as D1Database;
  });

  afterEach(() => sqlite.close());

  it('管理者と所属バンド一覧は本バンド順、自由バンドはバンド作成日時の古い順に並べる', async () => {
    const repository = createD1GroupRepository(db);
    for (const mode of ['admin', 'member'] as const) {
      expect((await repository.list(userId, mode)).map((group) => group.id)).toEqual(expectedGroupIds);
    }
    sqlite.prepare('DELETE FROM group_member_instruments WHERE group_id = ?').run(id(3));
    expect((await repository.list(userId, 'member')).map((group) => group.id)).toEqual(expectedGroupIds.slice(1));
  });

  it('未設定バンドは共通のバンド順、設定済みバンドは出演順に並べる', async () => {
    const repository = createD1TimelineRepository(db);
    expect((await repository.list(eventId)).unconfigured.map((item) => item.group_id)).toEqual(expectedGroupIds);
    sqlite.prepare('UPDATE entries SET position = ? WHERE group_id = ?').run(1, id(4));
    sqlite.prepare('UPDATE entries SET position = ? WHERE group_id = ?').run(2, id(3));
    const result = GetTimelineResponseSchema.parse(await repository.list(eventId));
    expect(result.configured.map((item) => item.group_id)).toEqual([id(4), id(3)]);
    expect(result.unconfigured.map((item) => item.group_id)).toEqual([id(2), id(5), id(6), id(7)]);
    expect(result.configured.map(item => item.main_index)).toEqual([null, 0]);
    expect(result.unconfigured.map(item => item.main_index)).toEqual([1, null, null, null]);
    expect(result.configured.map((item) => item.band_order)).toEqual([5, 1]);
    expect(result.unconfigured.map((item) => item.band_order)).toEqual([2, 3, 4, 6]);
    expect(result.unconfigured[0]).not.toHaveProperty('created_at');
  });

  it('セトリ未登録は締切よりバンド順を優先して5件に絞り、未作成の本バンドエントリーも含める', async () => {
    const items = await createD1DashboardRepository(db).emptySetlists(userId, window);
    expect(items.map((item) => [item.group_id, item.event_id])).toEqual([
      [id(3), eventId], [id(3), implicitEventId],
      [id(2), eventId], [id(2), implicitEventId], [id(5), eventId],
    ]);
    expect(items[0]).not.toHaveProperty('created_at');
    expect(items[0]).not.toHaveProperty('main_index');
  });

  it('セトリ未登録の所属・有効状態・曲登録済みの除外条件を保つ', async () => {
    sqlite.prepare('DELETE FROM group_member_instruments WHERE group_id = ?').run(id(3));
    sqlite.prepare('UPDATE groups SET is_active = FALSE WHERE id = ?').run(id(2));
    sqlite.prepare('INSERT INTO setlist_items (id, entry_id, position, title, artist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id(40), id(33), 1, '曲', 'アーティスト', now, now);
    expect((await createD1DashboardRepository(db).emptySetlists(userId, window)).map((item) => item.group_id))
      .toEqual([id(6), id(4), id(7)]);
  });
});
