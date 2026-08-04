import type { Bindings } from '../index';
import { getJSTDateString, getJSTDayRange, getJSTTimeRange, type AvailableInterval } from './reservation-processor';
import { recordExternalReservationUsage } from './external-processor';
import { broadcastReservationRealtimeEvent } from './reservation-realtime';
import { prepareAndSendReservationEmail } from './reservation-email';
import { hasReservationLimitConflict } from '../routes/reservations';

type StudioRow = {
  id: string;
  start_datetime: string;
  end_datetime: string;
  room_names: string;
};

type ApplicationRow = {
  id: string;
  external_studio_id: string;
  user_id: string;
  group_id: string | null;
  preferred_start_datetime: string | null;
  preferred_end_datetime: string | null;
  requested_duration_minutes: number | null;
  tie_breaker: string;
  created_at: string;
};

type PreparedApplication = ApplicationRow & {
  priority: number;
  fairnessScore: number;
  memberIds: string[];
  rangeStart: Date;
  rangeEnd: Date;
  requestedMinutes: number;
};

type ExistingReservation = {
  room_number: number;
  start_time: string;
  end_time: string;
};

type AllocatedIdentity = {
  memberIds: Set<string>;
  start: Date;
  end: Date;
};

type ReservationIdentityRow = {
  user_id: string;
  group_id: string | null;
  start_time: string;
  end_time: string;
};

const parseRoomNames = (value: string): string[] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== 'string' || name.trim() === '')) {
    throw new Error('INVALID_EXTERNAL_ROOM_NAMES');
  }
  return parsed;
};

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date) => startA < endB && endA > startB;

function subtractReservations(start: Date, end: Date, reservations: ExistingReservation[]): AvailableInterval[] {
  const available: AvailableInterval[] = [];
  let cursor = new Date(start);
  for (const reservation of reservations.sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const blockedStart = new Date(Math.max(start.getTime(), new Date(reservation.start_time).getTime()));
    const blockedEnd = new Date(Math.min(end.getTime(), new Date(reservation.end_time).getTime()));
    if (blockedEnd <= cursor || blockedStart >= end) continue;
    if (blockedStart > cursor) available.push({ start: new Date(cursor), end: blockedStart });
    if (blockedEnd > cursor) cursor = blockedEnd;
  }
  if (cursor < end) available.push({ start: cursor, end: new Date(end) });
  return available;
}

async function getGroupMemberIds(env: Bindings, groupId: string): Promise<string[]> {
  const members = await env.DB.prepare(`
    SELECT DISTINCT user_id
    FROM group_member_instruments
    WHERE group_id = ?
    ORDER BY user_id ASC
  `).bind(groupId).all<{ user_id: string }>();
  return members.results.map((member) => member.user_id);
}

async function getGroup(env: Bindings, groupId: string) {
  const group = await env.DB.prepare(`
    SELECT id, is_main, is_active
    FROM groups
    WHERE id = ?
  `).bind(groupId).first<{ id: string; is_main: number; is_active: number }>();
  if (!group || !group.is_active) return null;
  const memberIds = await getGroupMemberIds(env, groupId);
  if (memberIds.length === 0) return null;
  return { isMain: Boolean(group.is_main), memberIds };
}

async function getExistingReservationAllocations(
  env: Bindings,
  rangeStart: string,
  rangeEnd: string
): Promise<AllocatedIdentity[]> {
  const [hallReservations, externalReservations] = await Promise.all([
    env.DB.prepare(`
      SELECT user_id, group_id, start_time, end_time
      FROM reservations
      WHERE state IN ('PENDING', 'CONFIRMED')
        AND start_time < ? AND end_time > ?
    `).bind(rangeEnd, rangeStart).all<ReservationIdentityRow>(),
    env.DB.prepare(`
      SELECT user_id, group_id, start_time, end_time
      FROM external_reservations
      WHERE state = 'CONFIRMED'
        AND start_time < ? AND end_time > ?
    `).bind(rangeEnd, rangeStart).all<ReservationIdentityRow>(),
  ]);
  const memberCache = new Map<string, string[]>();
  const allocations: AllocatedIdentity[] = [];
  for (const reservation of [...hallReservations.results, ...externalReservations.results]) {
    let memberIds: string[];
    if (reservation.group_id) {
      const cached = memberCache.get(reservation.group_id);
      memberIds = cached ?? await getGroupMemberIds(env, reservation.group_id);
      if (!cached) memberCache.set(reservation.group_id, memberIds);
    } else {
      memberIds = [reservation.user_id];
    }
    allocations.push({
      memberIds: new Set(memberIds),
      start: new Date(reservation.start_time),
      end: new Date(reservation.end_time),
    });
  }
  return allocations;
}

async function getFairnessScore(env: Bindings, memberIds: string[], rangeEnd: Date): Promise<number> {
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 30);
  const placeholders = memberIds.map(() => '?').join(',');
  const usage = await env.DB.prepare(`
    SELECT user_id, COALESCE(SUM(minutes), 0) AS minutes
    FROM external_reservation_usage
    WHERE user_id IN (${placeholders})
      AND used_at >= ?
      AND used_at < ?
    GROUP BY user_id
  `).bind(...memberIds, rangeStart.toISOString(), rangeEnd.toISOString()).all<{ user_id: string; minutes: number }>();
  const minutesByMember = new Map(usage.results.map((row) => [row.user_id, Number(row.minutes)]));
  return memberIds.reduce((sum, id) => sum + (minutesByMember.get(id) ?? 0), 0) / memberIds.length;
}

function getApplicationRange(application: ApplicationRow, studio: StudioRow, targetDate: string) {
  const businessHours = getJSTTimeRange(targetDate, 6, 23);
  const studioStart = new Date(studio.start_datetime);
  const studioEnd = new Date(studio.end_datetime);
  const rangeStart = application.preferred_start_datetime
    ? new Date(application.preferred_start_datetime)
    : new Date(Math.max(studioStart.getTime(), businessHours.startUTC.getTime()));
  const rangeEnd = application.preferred_end_datetime
    ? new Date(application.preferred_end_datetime)
    : new Date(Math.min(studioEnd.getTime(), businessHours.endUTC.getTime()));
  if (rangeStart < studioStart || rangeEnd > studioEnd || rangeEnd <= rangeStart) return null;
  const requestedMinutes = application.requested_duration_minutes
    ?? Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 60000);
  return { rangeStart, rangeEnd, requestedMinutes };
}

function hasMemberConflict(
  memberIds: string[],
  start: Date,
  end: Date,
  allocated: AllocatedIdentity[]
): boolean {
  return allocated.some((item) => (
    overlaps(start, end, item.start, item.end)
    && memberIds.some((memberId) => item.memberIds.has(memberId))
  ));
}

function enumerateStarts(interval: AvailableInterval, durationMinutes: number): Date[] {
  const step = 5 * 60000;
  const first = Math.ceil(interval.start.getTime() / step) * step;
  const latest = interval.end.getTime() - durationMinutes * 60000;
  const starts: Date[] = [];
  for (let value = first; value <= latest; value += step) starts.push(new Date(value));
  return starts;
}

async function markLost(env: Bindings, applicationId: string, score: number | null, rank: number | null) {
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE external_lottery_applications
      SET state = 'LOST', fairness_score = ?, tie_break_rank = ?, updated_at = ?
      WHERE id = ? AND state = 'PENDING'
    `).bind(score, rank, new Date().toISOString(), applicationId),
    env.DB.prepare('DELETE FROM external_lottery_limit_holds WHERE application_id = ?').bind(applicationId),
  ]);
}

export async function processExternalLotteryForNextDay(env: Bindings): Promise<number> {
  const nextDay = new Date();
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const targetDate = getJSTDateString(nextDay);
  const dayRange = getJSTDayRange(targetDate);
  const studios = await env.DB.prepare(`
    SELECT id, start_datetime, end_datetime, room_names
    FROM external_studios
    WHERE start_datetime < ? AND end_datetime > ?
    ORDER BY start_datetime ASC, id ASC
  `).bind(dayRange.endUTC.toISOString(), dayRange.startUTC.toISOString()).all<StudioRow>();

  const allocated = await getExistingReservationAllocations(
    env,
    dayRange.startUTC.toISOString(),
    dayRange.endUTC.toISOString()
  );

  let processed = 0;
  for (const studio of studios.results) {
    const roomNames = parseRoomNames(studio.room_names);
    const applications = await env.DB.prepare(`
      SELECT id, external_studio_id, user_id, group_id,
             preferred_start_datetime, preferred_end_datetime,
             requested_duration_minutes, tie_breaker, created_at
      FROM external_lottery_applications
      WHERE external_studio_id = ? AND state = 'PENDING'
      ORDER BY created_at ASC, id ASC
    `).bind(studio.id).all<ApplicationRow>();

    const prepared: PreparedApplication[] = [];
    for (const application of applications.results) {
      const identity = application.group_id ? await getGroup(env, application.group_id) : { isMain: false, memberIds: [application.user_id] };
      const range = getApplicationRange(application, studio, targetDate);
      if (!identity || !range || range.requestedMinutes < 10) {
        await markLost(env, application.id, null, null);
        processed += 1;
        continue;
      }
      prepared.push({
        ...application,
        priority: application.group_id ? (identity.isMain ? 0 : 1) : 2,
        fairnessScore: await getFairnessScore(env, identity.memberIds, dayRange.startUTC),
        memberIds: identity.memberIds,
        ...range,
      });
    }

    prepared.sort((a, b) => a.priority - b.priority
      || a.fairnessScore - b.fairnessScore
      || a.tie_breaker.localeCompare(b.tie_breaker));
    const rankByApplication = new Map<string, number>();
    const rankCounters = new Map<string, number>();
    for (const application of prepared) {
      const key = `${application.priority}:${application.fairnessScore}`;
      const rank = (rankCounters.get(key) ?? 0) + 1;
      rankCounters.set(key, rank);
      rankByApplication.set(application.id, rank);
    }

    for (let index = 0; index < prepared.length; index += 1) {
      const application = prepared[index];
      const rank = rankByApplication.get(application.id) ?? 1;
      const alreadyCreated = await env.DB.prepare(`
        SELECT id, user_id, group_id, room_number, start_time, end_time
        FROM external_reservations WHERE id = ?
      `).bind(application.id).first<{
        id: string; user_id: string; group_id: string | null; room_number: number; start_time: string; end_time: string;
      }>();
      if (alreadyCreated) {
        const [recoverResult] = await env.DB.batch([
          env.DB.prepare(`
            UPDATE external_lottery_applications
            SET state = 'WON', fairness_score = ?, tie_break_rank = ?, assigned_room_number = ?,
                assigned_start_datetime = ?, assigned_end_datetime = ?, updated_at = ?
            WHERE id = ? AND state = 'PENDING'
          `).bind(application.fairnessScore, rank, alreadyCreated.room_number, alreadyCreated.start_time, alreadyCreated.end_time, new Date().toISOString(), application.id),
          env.DB.prepare('DELETE FROM external_lottery_limit_holds WHERE application_id = ?').bind(application.id),
        ]);
        if (Number(recoverResult.meta.changes ?? 0) === 0) continue;
        await recordExternalReservationUsage(env, alreadyCreated);
        allocated.push({
          memberIds: new Set(application.memberIds),
          start: new Date(alreadyCreated.start_time),
          end: new Date(alreadyCreated.end_time),
        });
        await prepareAndSendReservationEmail(env, {
          kind: 'EXTERNAL', reservationId: alreadyCreated.id, notificationType: 'RESERVATION_CONFIRMED',
        });
        processed += 1;
        continue;
      }

      const reservations = await env.DB.prepare(`
        SELECT room_number, start_time, end_time
        FROM external_reservations
        WHERE external_studio_id = ? AND state = 'CONFIRMED'
          AND start_time < ? AND end_time > ?
      `).bind(studio.id, application.rangeEnd.toISOString(), application.rangeStart.toISOString()).all<ExistingReservation>();
      const roomOptions = roomNames.map((_, roomIndex) => {
        const roomNumber = roomIndex + 1;
        const intervals = subtractReservations(
          application.rangeStart,
          application.rangeEnd,
          reservations.results.filter((reservation) => reservation.room_number === roomNumber)
        );
        const longestMinutes = intervals.reduce((max, interval) => Math.max(max, Math.floor((interval.end.getTime() - interval.start.getTime()) / 60000)), 0);
        return { roomNumber, intervals, longestMinutes };
      });
      const hasFullRoom = roomOptions.some((room) => room.longestMinutes >= application.requestedMinutes);
      const rankedRooms = roomOptions
        .filter((room) => hasFullRoom ? room.longestMinutes >= application.requestedMinutes : room.longestMinutes >= 10)
        .sort((a, b) => b.longestMinutes - a.longestMinutes || a.roomNumber - b.roomNumber);

      let assignment: { roomNumber: number; start: Date; end: Date } | null = null;
      for (const room of rankedRooms) {
        const duration = hasFullRoom
          ? application.requestedMinutes
          : Math.floor(room.longestMinutes / 5) * 5;
        if (duration < 10) continue;
        const candidates = room.intervals.flatMap((interval) => enumerateStarts(interval, duration)).map((start) => {
          const end = new Date(start.getTime() + duration * 60000);
          const contention = prepared.slice(index + 1).filter((remaining) => overlaps(start, end, remaining.rangeStart, remaining.rangeEnd)).length;
          return { start, end, contention };
        }).filter((candidate) => !hasMemberConflict(application.memberIds, candidate.start, candidate.end, allocated))
          .sort((a, b) => a.contention - b.contention || a.start.getTime() - b.start.getTime());
        for (const candidate of candidates) {
          const exceedsLimit = await hasReservationLimitConflict(
            env,
            application.user_id,
            application.group_id,
            candidate.start.toISOString(),
            candidate.end.toISOString(),
            { kind: 'LOTTERY', id: application.id }
          );
          if (!exceedsLimit) {
            assignment = { roomNumber: room.roomNumber, start: candidate.start, end: candidate.end };
            break;
          }
        }
        if (assignment) break;
      }

      if (!assignment) {
        await markLost(env, application.id, application.fairnessScore, rank);
        processed += 1;
        continue;
      }

      const now = new Date().toISOString();
      const [insertResult] = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO external_reservations
            (id, external_studio_id, room_number, user_id, group_id, start_time, end_time, state, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM external_lottery_applications WHERE id = ? AND state = 'PENDING'
          )
        `).bind(
          application.id, studio.id, assignment.roomNumber, application.user_id, application.group_id,
          assignment.start.toISOString(), assignment.end.toISOString(), now, now, application.id
        ),
        env.DB.prepare(`
          UPDATE external_lottery_applications
          SET state = 'WON', fairness_score = ?, tie_break_rank = ?, assigned_room_number = ?,
              assigned_start_datetime = ?, assigned_end_datetime = ?, updated_at = ?
          WHERE id = ? AND state = 'PENDING'
        `).bind(
          application.fairnessScore, rank, assignment.roomNumber,
          assignment.start.toISOString(), assignment.end.toISOString(), now, application.id
        ),
        env.DB.prepare('DELETE FROM external_lottery_limit_holds WHERE application_id = ?').bind(application.id),
      ]);
      if (Number(insertResult.meta.changes ?? 0) === 0) continue;
      await recordExternalReservationUsage(env, {
        id: application.id,
        user_id: application.user_id,
        group_id: application.group_id,
        start_time: assignment.start.toISOString(),
        end_time: assignment.end.toISOString(),
      });
      await prepareAndSendReservationEmail(env, {
        kind: 'EXTERNAL', reservationId: application.id, notificationType: 'RESERVATION_CONFIRMED',
      });
      allocated.push({ memberIds: new Set(application.memberIds), start: assignment.start, end: assignment.end });
      processed += 1;
    }
  }

  if (processed > 0) await broadcastReservationRealtimeEvent(env, 'reservations_changed');
  return processed;
}
