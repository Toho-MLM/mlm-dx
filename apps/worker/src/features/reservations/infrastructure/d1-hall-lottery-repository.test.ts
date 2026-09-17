import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import type { HallLottery } from '@shared-schemas';
import { createD1HallLotteryRepository } from './d1-hall-lottery-repository';
import { createD1HallReservationRepository } from './d1-hall-repository';
import { createD1ReservationLimitRepository } from './d1-limit-repository';
import { createReservationLimitService } from '../application/limits';
const schema = readFileSync(
  new URL('../../../../schema.sql', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../../../../migrations/018_add_period_hall_lotteries.sql',
    import.meta.url,
  ),
  'utf8',
);
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2026-09-25T15:00:00.000Z';
const start = '2026-10-01T01:00:00.000Z';
const end = '2026-10-01T03:00:00.000Z';
const lottery: HallLottery = {
  id: uuid(1),
  name: '秋',
  start_date: '2026-10-01',
  end_date: '2026-10-03',
  deadline_date: '2026-09-25',
  duration_minutes: 120,
  target_band_type: 'FREE',
  draw_at: now,
  state: 'OPEN',
};
function setup(migrate = false) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    migrate
      ? schema.slice(0, schema.indexOf('CREATE TABLE hall_lotteries'))
      : schema,
  );
  sqlite.exec(`INSERT INTO users (id,name,email,grade,created_at,updated_at) VALUES ('${uuid(2)}','test','test@example.invalid',1,'${now}','${now}');
    INSERT INTO groups (id,name,created_at,updated_at) VALUES ('${uuid(3)}','band','${now}','${now}');
    INSERT INTO group_member_instruments (id,group_id,user_id,instrument,created_at,updated_at) VALUES ('${uuid(4)}','${uuid(3)}','${uuid(2)}','VO','${now}','${now}');`);
  if (migrate) {
    sqlite.exec(
      `INSERT INTO reservations (id,user_id,group_id,start_time,end_time,created_at,updated_at) VALUES ('${uuid(99)}','${uuid(2)}','${uuid(3)}','2026-09-01T00:00:00Z','2026-09-01T01:00:00Z','${now}','${now}')`,
    );
    sqlite.exec(migration);
  }
  class Statement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number | null)[]) {
      this.values = values;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.values) ?? null;
    }
    async all() {
      return { results: sqlite.prepare(this.sql).all(...this.values) };
    }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.values);
      return { meta: { changes: Number(result.changes) } };
    }
  }
  const adapter = {
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
  };
  const db = adapter as unknown as D1Database;
  const repository = createD1HallLotteryRepository(db);
  const hall = createD1HallReservationRepository(db);
  const apply = () =>
    repository.apply({
      id: uuid(5),
      lotteryId: lottery.id,
      groupId: uuid(3),
      userId: uuid(2),
      preferences: [start],
      now: '2026-09-25T14:00:00.000Z',
    });
  const winner = {
    id: uuid(5),
    group_id: uuid(3),
    user_id: uuid(2),
    preferences: [start],
    rank: 1,
    start,
    end,
    reservationId: uuid(6),
  };
  return { sqlite, db, repository, hall, apply, winner };
}
describe('期間ホール抽選 D1 SQL / migration', () => {
  it('初期schemaとmigrationが同じ構造で、既存予約を保持する', () => {
    const fresh = setup();
    const migrated = setup(true);
    expect(
      migrated.sqlite
        .prepare('SELECT id FROM reservations WHERE id=?')
        .get(uuid(99)),
    ).toBeDefined();
    for (const table of [
      'hall_lotteries',
      'hall_lottery_applications',
      'hall_lottery_preferences',
      'reservations',
    ]) {
      expect(
        migrated.sqlite.prepare(`PRAGMA table_info(${table})`).all(),
      ).toEqual(fresh.sqlite.prepare(`PRAGMA table_info(${table})`).all());
    }
    expect(() => migrated.sqlite.exec(migration)).toThrow();
    fresh.sqlite.close();
    migrated.sqlite.close();
  });
  it('重複募集、同バンド申込、締切後の申込・取消をSQL境界で拒否する', async () => {
    const f = setup();
    expect(await f.repository.create(lottery, now)).toBe(true);
    expect(await f.repository.create({ ...lottery, id: uuid(10) }, now)).toBe(
      false,
    );
    expect(await f.apply()).toBe(true);
    expect(
      await f.repository.apply({
        id: uuid(7),
        lotteryId: lottery.id,
        groupId: uuid(3),
        userId: uuid(2),
        preferences: [start],
        now: '2026-09-25T14:00:00.000Z',
      }),
    ).toBe(false);
    expect(await f.repository.cancelApplication(uuid(5), uuid(2), now)).toBe(
      false,
    );
    const apps = await f.repository.applications(lottery.id, uuid(2));
    expect(apps[0].preferences).toEqual([start]);
    expect(apps[0]).not.toHaveProperty('created_at');
    f.sqlite.close();
  });
  it('旧ホール募集との重複を拒否する', async () => {
    const f = setup();
    f.sqlite
      .prepare(
        `INSERT INTO external_studios (id,target_type,start_datetime,end_datetime,draw_datetime,room_names,created_at,updated_at) VALUES (?,'HALL',?,?,?,'["ホール"]',?,?)`,
      )
      .run(uuid(9), start, end, now, now, now);
    expect(await f.repository.create(lottery, now)).toBe(false);
    f.sqlite.close();
  });
  it('抽選中は通常予約の作成・変更を守り、管理者例外を維持する', async () => {
    const f = setup();
    await f.repository.create(lottery, now);
    const input = {
      id: uuid(8),
      userId: uuid(2),
      groupId: uuid(3),
      startTime: start,
      endTime: end,
      createdAt: now,
      enforceProtection: true,
    };
    expect(await f.hall.createReservation(input)).toBe(false);
    expect(await f.hall.createReservationIfAvailable(input)).toBe(false);
    expect(
      await f.hall.createReservation({ ...input, enforceProtection: false }),
    ).toBe(true);
    const previous = (await f.hall.findReservation(uuid(8)))!;
    expect(
      await f.hall.updateReservationOptimistically({
        id: uuid(8),
        previous,
        startTime: start,
        endTime: end,
        state: 'PENDING',
        updatedAt: now,
        enforceProtection: true,
      }),
    ).toBe(false);
    const targets = await f.hall.listOverlappingLotteryTargets(start, end);
    expect(targets[0].has_pending_applications).toBe(true);
    await f.repository.cancel(lottery.id);
    expect(await f.hall.listOverlappingLotteryTargets(start, end)).toEqual([]);
    f.sqlite.close();
  });
  it('当選・予約・完了を一括確定し、再実行を拒否、上限と残時間から免除', async () => {
    const f = setup();
    await f.repository.create(lottery, now);
    await f.apply();
    await f.repository.beginDraw(lottery.id, [[uuid(5)], [], []], now);
    await f.repository.commit(lottery.id, [f.winner], now);
    expect((await f.repository.find(lottery.id))?.state).toBe('COMPLETED');
    expect((await f.repository.applications(lottery.id))[0].winning_rank).toBe(
      1,
    );
    await expect(
      f.repository.commit(lottery.id, [f.winner], now),
    ).rejects.toThrow();
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM reservations').get()?.n,
    ).toBe(1);
    const limits = createD1ReservationLimitRepository(f.db);
    await limits.createLimit(
      {
        id: uuid(11),
        scope: 'GROUP',
        limit_type: 'ROLLING',
        window_days: 7,
        max_minutes: 60,
        start_datetime: null,
        end_datetime: null,
      },
      now,
    );
    const service = createReservationLimitService(limits);
    expect(
      await service.hasConflict({
        userId: uuid(2),
        groupId: uuid(3),
        startTime: start,
        endTime: '2026-10-01T02:00:00.000Z',
      }),
    ).toBe(false);
    expect(
      (
        await service.getRemaining({
          scope: 'GROUP',
          targetId: uuid(3),
          referenceTime: start,
        })
      )[0].remaining_minutes,
    ).toBe(60);
    expect(
      (await f.hall.listOverlappingLotteryTargets(start, end))[0]
        .has_pending_applications,
    ).toBe(false);
    f.sqlite.close();
  });
  it('抽選計算後に発生した競合で全書込をrollbackし、保護を保持する', async () => {
    const f = setup();
    await f.repository.create(lottery, now);
    await f.apply();
    await f.repository.beginDraw(lottery.id, [[uuid(5)], [], []], now);
    await f.hall.createReservation({
      id: uuid(8),
      userId: uuid(2),
      groupId: null,
      startTime: start,
      endTime: end,
      createdAt: now,
    });
    await expect(
      f.repository.commit(lottery.id, [f.winner], now),
    ).rejects.toThrow('HALL_LOTTERY_CONFLICT');
    expect((await f.repository.find(lottery.id))?.state).toBe('DRAWING');
    expect((await f.repository.applications(lottery.id))[0].state).toBe(
      'PENDING',
    );
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM hall_lottery_commits').get()?.n,
    ).toBe(0);
    f.sqlite.close();
  });
  it('所属メンバーの外部予約を読取時と確定時の両方で除外する', async () => {
    const f = setup();
    await f.repository.create(lottery, now);
    await f.apply();
    f.sqlite
      .prepare(
        `INSERT INTO external_studios (id,target_type,start_datetime,end_datetime,room_names,created_at,updated_at)
      VALUES (?,'EXTERNAL',?,?,'["外部"]',?,?)`,
      )
      .run(uuid(12), start, end, now, now);
    f.sqlite
      .prepare(
        `INSERT INTO external_reservations (id,external_studio_id,room_number,user_id,start_time,end_time,state,created_at,updated_at)
      VALUES (?,?,1,?,?,?,'CONFIRMED',?,?)`,
      )
      .run(uuid(13), uuid(12), uuid(2), start, end, now, now);
    expect(await f.repository.occupied(lottery.id)).toContainEqual(
      expect.objectContaining({
        start_time: start,
        end_time: end,
        group_ids: [uuid(3)],
      }),
    );
    await f.repository.beginDraw(lottery.id, [[uuid(5)], [], []], now);
    await expect(
      f.repository.commit(lottery.id, [f.winner], now),
    ).rejects.toThrow('HALL_LOTTERY_CONFLICT');
    expect((await f.repository.find(lottery.id))?.state).toBe('DRAWING');
    f.sqlite.close();
  });
  it('途中の予約挿入が失敗した場合は先行する当選予約も残さない', async () => {
    const f = setup();
    await f.repository.create(lottery, now);
    await f.apply();
    await f.repository.beginDraw(lottery.id, [[uuid(5)], [], []], now);
    // An accidental duplicate winner fails after the first insert/update; the whole batch must roll back.
    await expect(
      f.repository.commit(
        lottery.id,
        [f.winner, { ...f.winner, reservationId: uuid(20) }],
        now,
      ),
    ).rejects.toThrow();
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM reservations').get()?.n,
    ).toBe(0);
    expect((await f.repository.applications(lottery.id))[0].state).toBe(
      'PENDING',
    );
    expect((await f.repository.find(lottery.id))?.state).toBe('DRAWING');
    f.sqlite.close();
  });
  it('非所属管理者の取消を許可するが、一般ユーザーと締切後の取消は拒否する', async () => {
    const f = setup();
    await f.repository.create(lottery, now);
    await f.apply();
    const before = '2026-09-25T14:59:59.999Z';
    expect(await f.repository.cancelApplication(uuid(5), uuid(9), before)).toBe(
      false,
    );
    expect(
      await f.repository.cancelApplication(uuid(5), uuid(9), now, true),
    ).toBe(false);
    expect(
      await f.repository.cancelApplication(uuid(5), uuid(9), before, true),
    ).toBe(true);
    expect((await f.repository.applications(lottery.id))[0].state).toBe(
      'CANCELLED',
    );
    expect(await f.repository.getActiveGroupBandType(uuid(3))).toBe('FREE');
    f.sqlite
      .prepare('UPDATE groups SET is_active = 0 WHERE id = ?')
      .run(uuid(3));
    expect(await f.repository.getActiveGroupBandType(uuid(3))).toBe(null);
    expect(await f.repository.getActiveGroupBandType(uuid(99))).toBe(null);
    f.sqlite.close();
  });

  it.each(['MAIN', 'FREE'] as const)(
    '対象区分 %s を保存し、申込書込み時にも区分を再確認する',
    async (target) => {
      const f = setup();
      await f.repository.create({ ...lottery, target_band_type: target }, now);
      expect((await f.repository.list())[0].target_band_type).toBe(target);
      f.sqlite
        .prepare('UPDATE groups SET main_index = ? WHERE id = ?')
        .run(target === 'MAIN' ? null : 1, uuid(3));
      expect(await f.apply()).toBe(false);
      expect(await f.repository.applications(lottery.id)).toEqual([]);
      f.sqlite
        .prepare('UPDATE groups SET main_index = ? WHERE id = ?')
        .run(target === 'MAIN' ? 1 : null, uuid(3));
      expect(await f.repository.getActiveGroupBandType(uuid(3))).toBe(target);
      expect(await f.apply()).toBe(true);
      expect(await f.repository.eligibleApplicationIds(lottery.id)).toEqual([
        uuid(5),
      ]);
      f.sqlite.close();
    },
  );
  it('抽選直前に区分が変わった場合は当選確定をrollbackし、再計算では候補から除外する', async () => {
    const f = setup();
    await f.repository.create(lottery, now);
    await f.apply();
    await f.repository.beginDraw(lottery.id, [[uuid(5)], [], []], now);
    f.sqlite
      .prepare('UPDATE groups SET main_index = 1 WHERE id = ?')
      .run(uuid(3));
    await expect(
      f.repository.commit(lottery.id, [f.winner], now),
    ).rejects.toThrow('HALL_LOTTERY_GROUP_INELIGIBLE');
    expect((await f.repository.find(lottery.id))?.state).toBe('DRAWING');
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM reservations').get()?.n,
    ).toBe(0);
    expect(await f.repository.eligibleApplicationIds(lottery.id)).toEqual([]);
    await f.repository.commit(lottery.id, [], now);
    expect((await f.repository.applications(lottery.id))[0].state).toBe('LOST');
    expect((await f.repository.find(lottery.id))?.state).toBe('COMPLETED');
    f.sqlite.close();
  });
});
