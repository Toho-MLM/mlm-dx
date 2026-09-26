import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { createReservationProcessingService } from '../application/processing';
import { createD1HallReservationRepository } from './d1-hall-repository';
import { createD1ReservationProcessingRepository } from './d1-processing-repository';
import { createD1ReservationScopeLockRepository } from './d1-scope-lock-repository';

const schema = readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../../migrations/019_prevent_reservations_in_unavailable_periods.sql', import.meta.url), 'utf8');
const userId = '00000000-0000-4000-8000-000000000001';
const reservationId = '00000000-0000-4000-8000-000000000002';
const periodId = '00000000-0000-4000-8000-000000000003';
const now = '2026-09-26T00:00:00.000Z';
const start = '2026-10-01T00:00:00.000Z';
const end = '2026-10-01T02:00:00.000Z';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec(migration);
  sqlite.prepare('INSERT INTO users (id, name, email, grade, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'Test', 'test@example.invalid', 1, now, now);

  class Statement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number | null)[]) {
      this.values = values;
      return this;
    }
    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.values) ?? null) as T | null;
    }
    async all<T>() {
      return { results: sqlite.prepare(this.sql).all(...this.values) as T[] };
    }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.values);
      return { meta: { changes: Number(result.changes) } };
    }
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
  return { sqlite, db, repository: createD1HallReservationRepository(db) };
}

function newReservation() {
  return {
    id: reservationId, userId, groupId: null, startTime: start, endTime: end,
    createdAt: now, enforceProtection: false,
  };
}

describe('reservation scope lock storage', () => {
  it('同じ名義のロックを二重取得せず、解放後に再取得する', async () => {
    const { db, sqlite } = setup();
    const locks = createD1ReservationScopeLockRepository(db);
    const expiresAt = '2026-09-26T00:01:00.000Z';
    expect(await locks.tryAcquire('PERSONAL:user', 'first', expiresAt, now)).toBe(true);
    expect(await locks.tryAcquire('PERSONAL:user', 'second', expiresAt, now)).toBe(false);
    expect(await locks.tryAcquire('GROUP:group', 'other', expiresAt, now)).toBe(true);
    await locks.release('PERSONAL:user', 'second');
    expect(await locks.tryAcquire('PERSONAL:user', 'second', expiresAt, now)).toBe(false);
    await locks.release('PERSONAL:user', 'first');
    expect(await locks.tryAcquire('PERSONAL:user', 'second', expiresAt, now)).toBe(true);
    sqlite.close();
  });
});

describe('post-draw hall reservations', () => {
  it('PENDING 同士の重複申込を受け付け、CONFIRMED との重複は拒否する', async () => {
    const { sqlite, repository } = setup();
    const secondId = '00000000-0000-4000-8000-000000000004';
    const thirdId = '00000000-0000-4000-8000-000000000005';

    expect(await repository.createReservationIfAvailable(newReservation())).toBe(true);
    expect(await repository.createReservationIfAvailable({ ...newReservation(), id: secondId })).toBe(true);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM reservations WHERE state = ?').get('PENDING'))
      .toMatchObject({ count: 2 });

    sqlite.prepare('UPDATE reservations SET state = ? WHERE id = ?').run('CONFIRMED', reservationId);
    expect(await repository.createReservationIfAvailable({ ...newReservation(), id: thirdId })).toBe(false);
  });

  it('PENDING との重複時間への変更を受け付け、CONFIRMED との重複変更は拒否する', async () => {
    const { sqlite, repository } = setup();
    const secondId = '00000000-0000-4000-8000-000000000004';
    expect(await repository.createReservationIfAvailable(newReservation())).toBe(true);
    expect(await repository.createReservationIfAvailable({
      ...newReservation(), id: secondId,
      startTime: '2026-10-01T03:00:00.000Z', endTime: '2026-10-01T04:00:00.000Z',
    })).toBe(true);

    const previous = await repository.findReservation(secondId);
    expect(previous).not.toBeNull();
    expect(await repository.updateReservationOptimistically({
      id: secondId, previous: previous!, startTime: '2026-10-01T01:00:00.000Z',
      endTime: '2026-10-01T03:00:00.000Z', state: 'PENDING', updatedAt: '2026-09-26T01:00:00.000Z',
      enforceAvailability: true,
    })).toBe(true);

    sqlite.prepare('UPDATE reservations SET state = ? WHERE id = ?').run('CONFIRMED', reservationId);
    const updated = await repository.findReservation(secondId);
    expect(updated).not.toBeNull();
    expect(await repository.updateReservationOptimistically({
      id: secondId, previous: updated!, startTime: '2026-10-01T00:30:00.000Z',
      endTime: '2026-10-01T02:30:00.000Z', state: 'PENDING', updatedAt: '2026-09-26T02:00:00.000Z',
      enforceAvailability: true,
    })).toBe(false);
  });

  it('重複する PENDING 申込を利用日午前0時の処理で確定と辞退に分ける', async () => {
    const { sqlite, db, repository } = setup();
    const secondId = '00000000-0000-4000-8000-000000000004';
    expect(await repository.createReservationIfAvailable(newReservation())).toBe(true);
    expect(await repository.createReservationIfAvailable({ ...newReservation(), id: secondId })).toBe(true);

    const service = createReservationProcessingService({
      repository: createD1ReservationProcessingRepository(db),
      clock: { now: () => new Date('2026-09-30T15:00:00.000Z') },
      effects: {
        broadcastReservationsChanged: async () => {},
        sendHallNotification: async () => {},
      },
    });
    expect(await service.processToday()).toBe(2);
    expect(sqlite.prepare('SELECT state FROM reservations ORDER BY state').all())
      .toEqual([{ state: 'CONFIRMED' }, { state: 'DECLINED' }]);
  });
});

describe('unavailable period and reservation writes', () => {
  it('影響予約の取得後に追加された予約があれば期間作成を拒否する', async () => {
    const { sqlite, repository } = setup();
    const affected = await repository.listAffectedReservations(start, end);
    expect(affected).toEqual([]);
    expect(await repository.createReservation(newReservation())).toBe(true);

    const result = await repository.createUnavailablePeriodWithAdjustments({
      id: periodId, startTime: start, endTime: end, reason: null, createdAt: now, adjustments: [],
    });
    expect(result).toEqual({ created: false, adjustedReservationIds: [] });
    expect(sqlite.prepare('SELECT id FROM unavailable_periods WHERE id = ?').get(periodId)).toBeUndefined();
  });

  it('期間作成後の予約と既存予約の変更を拒否する', async () => {
    const { sqlite, repository } = setup();
    const period = await repository.createUnavailablePeriodWithAdjustments({
      id: periodId, startTime: start, endTime: end, reason: null, createdAt: now, adjustments: [],
    });
    expect(period.created).toBe(true);
    expect(await repository.createReservation(newReservation())).toBe(false);
    expect(() => sqlite.prepare(`
      INSERT INTO reservations (id, user_id, start_time, end_time, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(reservationId, userId, start, end, now, now)).toThrow('BLOCKED_PERIOD_CONFLICT');
  });

  it('対象予約の時間が変わった場合は古い調整を適用しない', async () => {
    const { sqlite, repository } = setup();
    expect(await repository.createReservation(newReservation())).toBe(true);
    const affected = await repository.listAffectedReservations(start, end);
    sqlite.prepare('UPDATE reservations SET start_time = ? WHERE id = ?')
      .run('2026-10-01T00:15:00.000Z', reservationId);

    const result = await repository.createUnavailablePeriodWithAdjustments({
      id: periodId, startTime: start, endTime: end, reason: null, createdAt: now,
      adjustments: affected.map((reservation) => ({
        reservationId: reservation.id,
        previousStartTime: reservation.start_time,
        previousEndTime: reservation.end_time,
        decline: true,
      })),
    });
    expect(result.created).toBe(false);
    expect(sqlite.prepare('SELECT state FROM reservations WHERE id = ?').get(reservationId))
      .toMatchObject({ state: 'PENDING' });
  });

  it('同じスナップショットの予約だけを期間作成と同時に調整する', async () => {
    const { sqlite, repository } = setup();
    expect(await repository.createReservation(newReservation())).toBe(true);
    const affected = await repository.listAffectedReservations(
      '2026-10-01T00:30:00.000Z', '2026-10-01T00:45:00.000Z'
    );
    const result = await repository.createUnavailablePeriodWithAdjustments({
      id: periodId,
      startTime: '2026-10-01T00:30:00.000Z',
      endTime: '2026-10-01T00:45:00.000Z',
      reason: null,
      createdAt: now,
      adjustments: affected.map((reservation) => ({
        reservationId: reservation.id,
        previousStartTime: reservation.start_time,
        previousEndTime: reservation.end_time,
        startTime: '2026-10-01T00:45:00.000Z',
        endTime: end,
        decline: false,
      })),
    });
    expect(result).toEqual({ created: true, adjustedReservationIds: [reservationId] });
    expect(sqlite.prepare('SELECT start_time, end_time FROM reservations WHERE id = ?').get(reservationId))
      .toMatchObject({ start_time: '2026-10-01T00:45:00.000Z', end_time: end });
  });

  it('期間作成で辞退になった予約を管理操作で再確定できない', async () => {
    const { repository } = setup();
    expect(await repository.createReservation(newReservation())).toBe(true);
    const affected = await repository.listAffectedReservations(start, end);
    const result = await repository.createUnavailablePeriodWithAdjustments({
      id: periodId, startTime: start, endTime: end, reason: null, createdAt: now,
      adjustments: affected.map((reservation) => ({
        reservationId: reservation.id,
        previousStartTime: reservation.start_time,
        previousEndTime: reservation.end_time,
        decline: true,
      })),
    });
    expect(result.created).toBe(true);

    expect(await repository.updateStatusOptimistically({
      id: reservationId,
      previousState: 'DECLINED',
      previousUpdatedAt: now,
      nextState: 'CONFIRMED',
      startTime: start,
      endTime: end,
      updatedAt: '2026-09-26T00:01:00.000Z',
    })).toBe(false);
  });
});

describe('reservation processing state guards', () => {
  it('取得後に取消された予約を確定も辞退もせず、通知対象にしない', async () => {
    const { sqlite, db, repository } = setup();
    const processing = createD1ReservationProcessingRepository(db);
    expect(await repository.createReservation(newReservation())).toBe(true);
    const [snapshot] = await processing.listDueHallReservations('2026-10-02T00:00:00.000Z');
    await repository.updateState(reservationId, 'CANCELLED', '2026-10-01T00:00:00.000Z');

    expect(await processing.applyHallProcessResult(snapshot, { state: 'CONFIRMED' }, now))
      .toBe('STALE');
    expect(await processing.declineHallReservation(snapshot, now)).toBe(false);
    expect(sqlite.prepare('SELECT state FROM reservations WHERE id = ?').get(reservationId))
      .toMatchObject({ state: 'CANCELLED' });
  });

  it('前日の未判定予約を完了にせず、翌日の処理対象へ残す', async () => {
    const { sqlite, db, repository } = setup();
    const processing = createD1ReservationProcessingRepository(db);
    expect(await repository.createReservation(newReservation())).toBe(true);

    expect(await processing.completePastHallReservations('2026-10-02T00:00:00.000Z', now)).toBe(0);
    await processing.deleteHallReservationsBefore('2027-10-02T00:00:00.000Z');
    expect((await processing.listDueHallReservations('2026-10-02T23:59:59.999Z')).map((item) => item.id))
      .toEqual([reservationId]);
    expect(sqlite.prepare('SELECT state FROM reservations WHERE id = ?').get(reservationId))
      .toMatchObject({ state: 'PENDING' });
  });
});
