import type { D1Database } from '@cloudflare/workers-types';
import {
  HallLotterySchema,
  HallLotteryApplicationSchema,
  HallLotteryBandTypeSchema,
} from '@shared-schemas';
import type { HallLotteryRepository } from '../application/hall-lottery';
import type { HallOccupied } from '../domain/hall-lottery';
const eligibleBand = `g.is_active = 1 AND ((l.target_band_type = 'MAIN' AND g.main_index IS NOT NULL)
  OR (l.target_band_type = 'FREE' AND g.main_index IS NULL))`;

export function createD1HallLotteryRepository(
  db: D1Database,
): HallLotteryRepository {
  return {
    async list() {
      const rows = await db
        .prepare('SELECT * FROM hall_lotteries ORDER BY start_date DESC, id')
        .all();
      return (rows.results ?? []).map((r) => HallLotterySchema.parse(r));
    },
    async find(id) {
      const row = await db
        .prepare('SELECT * FROM hall_lotteries WHERE id = ?')
        .bind(id)
        .first();
      return row ? HallLotterySchema.parse(row) : null;
    },
    async create(l, now) {
      const result = await db
        .prepare(
          `INSERT INTO hall_lotteries
        (id,name,start_date,end_date,deadline_date,duration_minutes,draw_at,target_band_type,state,created_at)
        SELECT ?,?,?,?,?,?,?,?,'OPEN',? WHERE NOT EXISTS (
          SELECT 1 FROM hall_lotteries WHERE state != 'CANCELLED' AND start_date <= ? AND end_date >= ?
        ) AND NOT EXISTS (
          SELECT 1 FROM external_studios WHERE target_type = 'HALL' AND start_datetime < ? AND end_datetime > ?
        )`,
        )
        .bind(
          l.id,
          l.name,
          l.start_date,
          l.end_date,
          l.deadline_date,
          l.duration_minutes,
          l.draw_at,
          l.target_band_type,
          now,
          l.end_date,
          l.start_date,
          new Date(`${l.end_date}T23:00:00+09:00`).toISOString(),
          new Date(`${l.start_date}T06:00:00+09:00`).toISOString(),
        )
        .run();
      return result.meta.changes > 0;
    },
    async applications(id, userId) {
      const rows = await db
        .prepare(
          `SELECT a.*, g.name group_name,
        (SELECT json_group_array(start_time) FROM (SELECT start_time FROM hall_lottery_preferences WHERE application_id=a.id ORDER BY rank)) preferences
        FROM hall_lottery_applications a JOIN groups g ON g.id=a.group_id WHERE a.lottery_id=?
        ${userId ? 'AND (a.user_id=? OR EXISTS (SELECT 1 FROM group_member_instruments m WHERE m.group_id=a.group_id AND m.user_id=?))' : ''}
        ORDER BY a.id`,
        )
        .bind(id, ...(userId ? [userId, userId] : []))
        .all<Record<string, unknown>>();
      return (rows.results ?? []).map((r) =>
        HallLotteryApplicationSchema.parse({
          ...r,
          preferences: JSON.parse(String(r.preferences)),
        }),
      );
    },
    async getActiveGroupBandType(groupId) {
      const row = await db
        .prepare(
          `SELECT CASE WHEN main_index IS NOT NULL THEN 'MAIN' ELSE 'FREE' END band_type
        FROM groups WHERE id = ? AND is_active = 1`,
        )
        .bind(groupId)
        .first<{ band_type: string }>();
      return row ? HallLotteryBandTypeSchema.parse(row.band_type) : null;
    },
    async eligibleApplicationIds(lotteryId) {
      const rows = await db
        .prepare(
          `SELECT a.id FROM hall_lottery_applications a
        JOIN hall_lotteries l ON l.id = a.lottery_id JOIN groups g ON g.id = a.group_id
        WHERE a.lottery_id = ? AND a.state = 'PENDING' AND ${eligibleBand}`,
        )
        .bind(lotteryId)
        .all<{ id: string }>();
      return (rows.results ?? []).map((row) => row.id);
    },
    async isMember(userId, groupId) {
      return Boolean(
        await db
          .prepare(
            `SELECT 1 FROM group_member_instruments m JOIN groups g ON g.id=m.group_id
        WHERE m.user_id=? AND m.group_id=? AND g.is_active=1`,
          )
          .bind(userId, groupId)
          .first(),
      );
    },
    async apply(i) {
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO hall_lottery_applications (id,lottery_id,group_id,user_id,created_at)
          SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM hall_lotteries l JOIN groups g ON g.id=?
            WHERE l.id=? AND l.state='OPEN' AND l.draw_at>? AND ${eligibleBand})
          AND NOT EXISTS (SELECT 1 FROM hall_lottery_applications WHERE lottery_id=? AND group_id=? AND state!='CANCELLED')`,
          )
          .bind(
            i.id,
            i.lotteryId,
            i.groupId,
            i.userId,
            i.now,
            i.groupId,
            i.lotteryId,
            i.now,
            i.lotteryId,
            i.groupId,
          ),
        ...i.preferences.map((p, index) =>
          db
            .prepare(
              `INSERT INTO hall_lottery_preferences (application_id,rank,start_time)
          SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM hall_lottery_applications WHERE id=?)`,
            )
            .bind(i.id, index + 1, p, i.id),
        ),
      ]);
      return results[0].meta.changes > 0;
    },
    async cancelApplication(id, userId, now, admin = false) {
      const r = await db
        .prepare(
          `UPDATE hall_lottery_applications SET state='CANCELLED' WHERE id=? AND state='PENDING'
        AND EXISTS (SELECT 1 FROM hall_lotteries l WHERE l.id=lottery_id AND l.state='OPEN' AND l.draw_at>?)
        AND (? = 1 OR EXISTS (SELECT 1 FROM group_member_instruments m WHERE m.group_id=hall_lottery_applications.group_id AND m.user_id=?))`,
        )
        .bind(id, now, admin ? 1 : 0, userId)
        .run();
      return r.meta.changes > 0;
    },
    async cancel(id) {
      const results = await db.batch([
        db
          .prepare(
            "UPDATE hall_lotteries SET state='CANCELLED' WHERE id=? AND state='OPEN'",
          )
          .bind(id),
        db
          .prepare(
            `UPDATE hall_lottery_applications SET state='CANCELLED' WHERE lottery_id=? AND state='PENDING'
          AND EXISTS (SELECT 1 FROM hall_lotteries WHERE id=? AND state='CANCELLED')`,
          )
          .bind(id, id),
      ]);
      return results[0].meta.changes > 0;
    },
    async beginDraw(id, order, now) {
      await db
        .prepare(
          `UPDATE hall_lotteries SET state='DRAWING',draw_order=? WHERE id=? AND state='OPEN' AND draw_at<=?
        AND (SELECT COUNT(*) FROM hall_lottery_applications WHERE lottery_id=? AND state='PENDING')=?
        AND NOT EXISTS (SELECT 1 FROM hall_lottery_applications WHERE lottery_id=? AND state='PENDING'
          AND id NOT IN (SELECT value FROM json_each(?, '$[0]')))`,
        )
        .bind(
          JSON.stringify(order),
          id,
          now,
          id,
          order[0].length,
          id,
          JSON.stringify(order),
        )
        .run();
      const row = await db
        .prepare(
          "SELECT draw_order FROM hall_lotteries WHERE id=? AND state='DRAWING'",
        )
        .bind(id)
        .first<{ draw_order: string }>();
      return row ? (JSON.parse(row.draw_order) as string[][]) : null;
    },
    async occupied(id) {
      const hall = await db
        .prepare(
          `SELECT start_time,end_time FROM reservations WHERE state IN ('PENDING','CONFIRMED')
        UNION ALL SELECT start_datetime,end_datetime FROM unavailable_periods`,
        )
        .all<HallOccupied>();
      const external = await db
        .prepare(
          `SELECT r.start_time,r.end_time,a.group_id FROM external_reservations r
        JOIN hall_lottery_applications a ON a.lottery_id=? AND a.state='PENDING'
        WHERE r.state IN ('PENDING','CONFIRMED') AND EXISTS (
          SELECT 1 FROM group_member_instruments m WHERE m.group_id=a.group_id AND
          (m.user_id=r.user_id OR EXISTS (SELECT 1 FROM group_member_instruments other WHERE other.group_id=r.group_id AND other.user_id=m.user_id)))`,
        )
        .bind(id)
        .all<{ start_time: string; end_time: string; group_id: string }>();
      return [
        ...(hall.results ?? []),
        ...(external.results ?? []).map((r) => ({
          ...r,
          group_ids: [r.group_id],
        })),
      ];
    },
    async commit(id, winners, now) {
      await db.batch([
        db
          .prepare('INSERT INTO hall_lottery_commits (lottery_id) VALUES (?)')
          .bind(id),
        ...winners.flatMap((w) => [
          db
            .prepare(
              `INSERT INTO reservations (id,user_id,group_id,start_time,end_time,state,created_at,updated_at,hall_lottery_application_id)
            VALUES (?,?,?,?,?,'CONFIRMED',?,?,?)`,
            )
            .bind(
              w.reservationId,
              w.user_id,
              w.group_id,
              w.start,
              w.end,
              now,
              now,
              w.id,
            ),
          db
            .prepare(
              `UPDATE hall_lottery_applications SET state='WON',winning_rank=?,reservation_id=?,assigned_start=?,assigned_end=? WHERE id=?`,
            )
            .bind(w.rank, w.reservationId, w.start, w.end, w.id),
        ]),
        db
          .prepare(
            "UPDATE hall_lottery_applications SET state='LOST' WHERE lottery_id=? AND state='PENDING'",
          )
          .bind(id),
        db
          .prepare(
            "UPDATE hall_lotteries SET state='COMPLETED' WHERE id=? AND state='DRAWING'",
          )
          .bind(id),
      ]);
    },
  };
}
