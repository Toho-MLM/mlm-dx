import { Hono } from 'hono';
import { ZodError } from 'zod';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { requireAdmin } from '../utils/admin';
import { broadcastReservationRealtimeEvent } from '../utils/reservation-realtime';
import type { EmailNotificationType } from '../../../../lib/shared-schemas';
import { prepareAndSendReservationEmail, prepareReservationEmail, sendPreparedReservationEmail } from '../utils/reservation-email';
import {
  CheckExternalReservationRequestSchema,
  CreateExternalLotteryApplicationRequestSchema,
  CreateExternalRequestSchema,
  CreateExternalReservationRequestSchema,
  ExternalLotteryApplicationSchema,
  ExternalReservationConflictSchema,
  ExternalReservationSchema,
  ExternalSchema,
  UpdateExternalReservationRequestSchema,
  UpdateReservationStatusRequestSchema,
  EXTERNAL_LOTTERY_MAX_DURATION_MINUTES,
  EXTERNAL_LOTTERY_MIN_DURATION_MINUTES,
  isExternalLotteryReservationProtected,
  validateExternalReservationTime,
  type ReservationState,
} from '../../../../lib/shared-schemas';
import { parseUuid } from '../utils/uuid';
import { getJSTDateString, getJSTDayRange } from '../utils/reservation-processor';
import { getExternalLotteryFairnessScore } from '../utils/external-lottery';
import { createReservationLimitService } from '../features/reservations/application/limits';
import { createD1ReservationLimitRepository } from '../features/reservations/infrastructure/d1-limit-repository';
import { createD1GroupMembershipReader } from '../features/reservations/infrastructure/d1-membership-reader';
import { checkActiveGroupAccess } from '../features/reservations/application/membership';
import { isValidHallLotteryTarget, parseRoomNames } from '../features/reservations/domain/external-lottery';
import { createD1ExternalReservationRepository } from '../features/reservations/infrastructure/d1-external-repository';
import type { ExternalStudioRecord as StudioRow } from '../features/reservations/application/external-repository';

const externalStudioRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const externalReservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function hasReservationLimitConflict(
  env: Bindings,
  userId: string,
  groupId: string | null,
  startTime: string,
  endTime: string,
  exclude?: { kind: 'HALL' | 'EXTERNAL' | 'LOTTERY'; id: string }
): Promise<boolean> {
  return createReservationLimitService(createD1ReservationLimitRepository(env.DB)).hasConflict({
    userId,
    groupId,
    startTime,
    endTime,
    exclude,
  });
}

type GroupMemberRow = { id: string; name: string };

function normalizeStudio(row: StudioRow) {
  return ExternalSchema.parse({ ...row, room_names: parseRoomNames(row.room_names) });
}

async function getStudio(env: Bindings, id: string): Promise<(StudioRow & { roomNames: string[] }) | null> {
  const row = await createD1ExternalReservationRepository(env.DB).findStudio(id);
  return row ? { ...row, roomNames: parseRoomNames(row.room_names) } : null;
}

async function getIdentityMembers(env: Bindings, userId: string, groupId: string | null): Promise<GroupMemberRow[]> {
  return createD1GroupMembershipReader(env.DB).listIdentityMembers(userId, groupId);
}

async function validateReservationBase(
  env: Bindings,
  userId: string,
  userRole: string,
  externalStudioId: string,
  roomNumber: number,
  groupId: string | null,
  startTime: string,
  endTime: string,
  isAdminMode: boolean,
  excludeReservationId?: string
): Promise<{ error?: string; status?: 400 | 403 | 404 | 409 }> {
  if (isAdminMode) {
    try { requireAdmin(userRole); } catch { return { error: 'INSUFFICIENT_PERMISSIONS', status: 403 }; }
  }
  const validation = validateExternalReservationTime(startTime, endTime);
  if (!validation.isValid) return { error: validation.error || 'INVALID_RESERVATION_TIME', status: 400 };

  if (groupId) {
    const access = await checkActiveGroupAccess(
      createD1GroupMembershipReader(env.DB), userId, groupId, !isAdminMode,
    );
    if (access === 'GROUP_INACTIVE_OR_MISSING') {
      return { error: 'GROUP_NOT_FOUND', status: 400 };
    }
    if (access === 'NOT_MEMBER') return { error: 'NOT_GROUP_MEMBER', status: 403 };
  }

  const studio = await getStudio(env, externalStudioId);
  if (!studio) return { error: 'EXTERNAL_NOT_FOUND', status: 404 };
  if (studio.target_type !== 'EXTERNAL') return { error: 'EXTERNAL_NOT_FOUND', status: 404 };
  if (roomNumber < 1 || roomNumber > studio.roomNames.length) return { error: 'INVALID_ROOM_NUMBER', status: 400 };
  if (new Date(startTime) < new Date(studio.start_datetime) || new Date(endTime) > new Date(studio.end_datetime)) {
    return { error: 'EXTERNAL_PERIOD_CONFLICT', status: 400 };
  }
  if (!isAdminMode && isExternalLotteryReservationProtected(startTime, endTime)) {
    return { error: 'EXTERNAL_LOTTERY_PERIOD_PROTECTED', status: 409 };
  }
  if (await createD1ExternalReservationRepository(env.DB).hasRoomConflict({
    studioId: externalStudioId,
    roomNumber,
    startTime,
    endTime,
    excludeId: excludeReservationId,
  })) return { error: 'RESERVATION_CONFLICT', status: 409 };
  if (!isAdminMode && await hasReservationLimitConflict(
    env, userId, groupId, startTime, endTime,
    excludeReservationId ? { kind: 'EXTERNAL', id: excludeReservationId } : undefined
  )) return { error: 'RESERVATION_LIMIT_EXCEEDED', status: 400 };
  return {};
}

async function getMemberConflicts(env: Bindings, userId: string, groupId: string | null, startTime: string, endTime: string, excludeId?: string) {
  const members = await getIdentityMembers(env, userId, groupId);
  if (members.length === 0) return [];
  const memberIds = members.map((member) => member.id);
  const names = new Map(members.map((member) => [member.id, member.name]));
  const rows = await createD1ExternalReservationRepository(env.DB).listMemberConflictRows({
    memberIds,
    startTime,
    endTime,
    excludeId,
  });
  const seen = new Set<string>();
  return rows.map((row) => ({
    member_id: row.member_id,
    member_name: names.get(row.member_id) || 'メンバー',
    reservation_id: row.reservation_id,
    reservation_type: row.reservation_type,
    reservation_name: row.reservation_name || '予約',
    location_name: row.location_name,
    start_time: row.start_time,
    end_time: row.end_time,
  })).filter((item) => {
    const key = `${item.member_id}:${item.reservation_type}:${item.reservation_id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((item) => ExternalReservationConflictSchema.parse(item));
}

function notificationForStatus(state: ReservationState): EmailNotificationType | null {
  if (state === 'PENDING') return 'RESERVATION_RECEIVED';
  if (state === 'CONFIRMED') return 'RESERVATION_CONFIRMED';
  if (state === 'COMPLETED') return null;
  return 'RESERVATION_REVOKED';
}

externalStudioRoutes.use('*', requireAuth);
externalReservationRoutes.use('*', requireAuth);

externalStudioRoutes.get('/studios', async (c) => {
  try {
    const rows = await createD1ExternalReservationRepository(c.env.DB).listStudios();
    return c.json({ success: true, data: rows.map(normalizeStudio) });
  } catch (error) {
    console.error('Error fetching external studios:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalStudioRoutes.post('/studios/bulk', async (c) => {
  try {
    requireAdmin(c.get('user').role);
    const data = CreateExternalRequestSchema.parse(await c.req.json());
    const roomNames = data.target_type === 'HALL'
      ? ['ホール']
      : data.names.map((name) => name.trim());
    if (roomNames.some((name) => !name) || new Set(roomNames).size !== roomNames.length) {
      return c.json({ success: false, error: 'INVALID_ROOM_NAMES' }, 400);
    }
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    if (data.target_type === 'HALL') {
      if (!isValidHallLotteryTarget(data.start_datetime, data.end_datetime)) {
        return c.json({ success: false, error: 'INVALID_HALL_LOTTERY_TARGET' }, 400);
      }
      if (await externalRepository.hasHallTargetOverlap(data.start_datetime, data.end_datetime)) {
        return c.json({ success: false, error: 'HALL_LOTTERY_TARGET_CONFLICT' }, 409);
      }
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const created = await externalRepository.createStudio({
      id,
      targetType: data.target_type,
      startTime: data.start_datetime,
      endTime: data.end_datetime,
      roomNames,
      createdAt: now,
    });
    if (!created) {
      return c.json({ success: false, error: 'HALL_LOTTERY_TARGET_CONFLICT' }, 409);
    }
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    return c.json({ success: true, data: {
      id,
      target_type: data.target_type,
      start_datetime: data.start_datetime,
      end_datetime: data.end_datetime,
      room_names: roomNames,
    } });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error creating external studio:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalStudioRoutes.delete('/studios/:id', async (c) => {
  try {
    requireAdmin(c.get('user').role);
    const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const studio = await getStudio(c.env, id);
    if (!studio) return c.json({ success: false, error: 'EXTERNAL_NOT_FOUND' }, 404);
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    const updatedAt = new Date().toISOString();
    await externalRepository.closeLotteryApplications(id, updatedAt);
    const affected = await externalRepository.listRevocableReservationIds(id, studio.target_type);
    const preparedEmails = [];
    for (const reservationId of affected) {
      try {
        preparedEmails.push(await prepareReservationEmail(c.env, {
          kind: studio.target_type, reservationId,
          notificationType: 'RESERVATION_REVOKED', reservationStatusOverride: 'DECLINED',
        }));
      } catch (error) { console.error('Failed to prepare revoked reservation email:', error); }
    }
    await externalRepository.deleteStudioCascade(id, studio.target_type, updatedAt);
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil((async () => { for (const email of preparedEmails) await sendPreparedReservationEmail(c.env, email); })());
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error deleting external studio:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const admin = c.req.query('admin') === 'true';
    if (admin) { try { requireAdmin(user.role); } catch { return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403); } }
    const rows = await createD1ExternalReservationRepository(c.env.DB).listVisibleReservations(user.id, admin);
    return c.json({
      success: true,
      data: rows.map((row) => ExternalReservationSchema.parse({
        ...row,
        cancellable: Boolean(row.cancellable),
      })),
    });
  } catch (error) {
    console.error('Error fetching external reservations:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/check', async (c) => {
  try {
    const user = c.get('user');
    const data = CheckExternalReservationRequestSchema.parse(await c.req.json());
    const groupId = data.group_id ?? null;
    const validation = await validateReservationBase(
      c.env, user.id, user.role, data.external_studio_id, data.room_number,
      groupId, data.start_time, data.end_time, data.admin === true
    );
    if (validation.error) return c.json({ success: false, error: validation.error }, validation.status || 400);
    return c.json({ success: true, data: await getMemberConflicts(c.env, user.id, groupId, data.start_time, data.end_time) });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error checking external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const data = CreateExternalReservationRequestSchema.parse(await c.req.json());
    const groupId = data.group_id ?? null;
    const admin = data.admin === true;
    const validation = await validateReservationBase(c.env, user.id, user.role, data.external_studio_id, data.room_number, groupId, data.start_time, data.end_time, admin);
    if (validation.error) return c.json({ success: false, error: validation.error }, validation.status || 400);
    const conflicts = await getMemberConflicts(c.env, user.id, groupId, data.start_time, data.end_time);
    if (conflicts.length && !data.acknowledged_member_conflicts) return c.json({ success: false, error: 'MEMBER_RESERVATION_CONFLICT_WARNING', data: conflicts });
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    const inserted = await externalRepository.createReservationIfAvailable({
      id,
      studioId: data.external_studio_id,
      roomNumber: data.room_number,
      userId: user.id,
      groupId,
      startTime: data.start_time,
      endTime: data.end_time,
      createdAt: now,
    });
    if (!inserted) {
      return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }
    if (!admin && await hasReservationLimitConflict(
      c.env,
      user.id,
      groupId,
      data.start_time,
      data.end_time,
      { kind: 'EXTERNAL', id }
    )) {
      await externalRepository.deleteReservation(id);
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 409);
    }
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, { kind: 'EXTERNAL', reservationId: id, notificationType: 'RESERVATION_CONFIRMED' }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error creating external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.get('/lottery', async (c) => {
  try {
    const rows = await createD1ExternalReservationRepository(c.env.DB).listLotteryApplications();
    const fairnessCache = new Map<string, Promise<number>>();
    const data = await Promise.all(rows.map(async (row) => {
      let fairnessScore = row.fairness_score;
      if (row.state === 'PENDING') {
        const groupId = row.group_id === null ? null : String(row.group_id);
        const targetDate = getJSTDateString(new Date(String(row.studio_start_datetime)));
        const targetType = row.target_type === 'HALL' ? 'HALL' : 'EXTERNAL';
        const cacheKey = `${targetType}:${targetDate}:${groupId ?? `user:${String(row.user_id)}`}`;
        let scorePromise = fairnessCache.get(cacheKey);
        if (!scorePromise) {
          scorePromise = getExternalLotteryFairnessScore(
            c.env,
            String(row.user_id),
            groupId,
            getJSTDayRange(targetDate).startUTC,
            targetType
          );
          fairnessCache.set(cacheKey, scorePromise);
        }
        fairnessScore = await scorePromise;
      }
      return ExternalLotteryApplicationSchema.parse({
        ...row,
        fairness_score: fairnessScore,
        is_main: row.is_main === null ? null : Boolean(row.is_main),
        room_names: parseRoomNames(String(row.room_names)),
      });
    }));
    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching external lottery applications:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/lottery', async (c) => {
  try {
    const user = c.get('user');
    const data = CreateExternalLotteryApplicationRequestSchema.parse(await c.req.json());
    const groupId = data.group_id ?? null;
    if (groupId) {
      const access = await checkActiveGroupAccess(
        createD1GroupMembershipReader(c.env.DB), user.id, groupId, true,
      );
      if (access === 'GROUP_INACTIVE_OR_MISSING') {
        return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 400);
      }
      if (access === 'NOT_MEMBER') {
        return c.json({ success: false, error: 'NOT_GROUP_MEMBER' }, 403);
      }
    }
    const studio = await getStudio(c.env, data.external_studio_id);
    if (!studio) return c.json({ success: false, error: 'EXTERNAL_NOT_FOUND' }, 404);
    const preferredStart = data.preferred_start_datetime ? new Date(data.preferred_start_datetime) : null;
    const preferredEnd = data.preferred_end_datetime ? new Date(data.preferred_end_datetime) : null;
    const targetDate = preferredStart
      ? getJSTDateString(preferredStart)
      : getJSTDateString(new Date(studio.start_datetime));
    const today = getJSTDateString(new Date());
    const tomorrow = new Date(`${today}T00:00:00+09:00`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const max = new Date(`${today}T00:00:00+09:00`); max.setUTCDate(max.getUTCDate() + 14);
    const target = new Date(`${targetDate}T00:00:00+09:00`);
    if (target < tomorrow || target > max) return c.json({ success: false, error: 'EXTERNAL_LOTTERY_DATE_OUT_OF_RANGE' }, 400);
    const drawAt = new Date(`${targetDate}T21:00:00+09:00`);
    drawAt.setUTCDate(drawAt.getUTCDate() - 1);
    if (new Date() >= drawAt) return c.json({ success: false, error: 'EXTERNAL_LOTTERY_CLOSED' }, 400);
    if (preferredStart && preferredEnd) {
      if (
        getJSTDateString(preferredStart) !== targetDate
        || preferredStart < new Date(studio.start_datetime)
        || preferredEnd > new Date(studio.end_datetime)
      ) {
        return c.json({ success: false, error: 'EXTERNAL_PERIOD_CONFLICT' }, 400);
      }
    }
    const rangeStart = preferredStart?.toISOString() ?? studio.start_datetime;
    const rangeEnd = preferredEnd?.toISOString() ?? studio.end_datetime;
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    if (await externalRepository.hasLotteryOverlap({
      userId: user.id,
      groupId,
      rangeStart,
      rangeEnd,
    })) return c.json({ success: false, error: 'LOTTERY_APPLICATION_CONFLICT' }, 409);

    const holdStart = preferredStart ?? new Date(studio.start_datetime);
    const availableEnd = preferredEnd ?? new Date(studio.end_datetime);
    const requestedMinutes = data.requested_duration_minutes;
    const holdEnd = new Date(holdStart.getTime() + requestedMinutes * 60000);
    if (
      requestedMinutes < EXTERNAL_LOTTERY_MIN_DURATION_MINUTES ||
      requestedMinutes > EXTERNAL_LOTTERY_MAX_DURATION_MINUTES ||
      holdEnd > availableEnd
    ) {
      return c.json({ success: false, error: 'INVALID_RESERVATION_TIME' }, 400);
    }
    if (await hasReservationLimitConflict(
      c.env,
      user.id,
      groupId,
      holdStart.toISOString(),
      holdEnd.toISOString()
    )) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 400);
    }

    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const inserted = await externalRepository.createLotteryApplicationIfAvailable({
      id,
      studioId: studio.id,
      userId: user.id,
      groupId,
      preferredStart: data.preferred_start_datetime,
      preferredEnd: data.preferred_end_datetime,
      requestedMinutes: data.requested_duration_minutes,
      rangeStart,
      rangeEnd,
      createdAt: now,
    });
    if (!inserted) {
      return c.json({ success: false, error: 'LOTTERY_APPLICATION_CONFLICT' }, 409);
    }
    if (await hasReservationLimitConflict(
      c.env,
      user.id,
      groupId,
      holdStart.toISOString(),
      holdEnd.toISOString(),
      { kind: 'LOTTERY', id }
    )) {
      await externalRepository.deleteLotteryApplication(id);
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 409);
    }
    return c.json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error creating external lottery application:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/lottery/:id/cancel', async (c) => {
  try {
    const user = c.get('user'); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    const application = await externalRepository.findLotteryApplication(id);
    if (!application) return c.json({ success: false, error: 'LOTTERY_APPLICATION_NOT_FOUND' }, 404);
    const permitted = application.user_id === user.id || (application.group_id !== null && await createD1GroupMembershipReader(c.env.DB).isUserInGroup(user.id, application.group_id));
    if (!permitted) return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    if (application.state !== 'PENDING') return c.json({ success: false, error: 'LOTTERY_APPLICATION_CANNOT_BE_CANCELLED' }, 400);
    if (!await externalRepository.cancelPendingLotteryApplication(id, new Date().toISOString())) {
      return c.json({ success: false, error: 'LOTTERY_APPLICATION_CANNOT_BE_CANCELLED' }, 400);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Error cancelling lottery application:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user'); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const data = UpdateExternalReservationRequestSchema.parse(await c.req.json()); const admin = data.admin === true;
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    const reservation = await externalRepository.findReservation(id);
    if (!reservation) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    const permitted = admin || reservation.user_id === user.id || (reservation.group_id !== null && await createD1GroupMembershipReader(c.env.DB).isUserInGroup(user.id, reservation.group_id));
    if (!permitted) return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 403);
    if (reservation.state !== 'CONFIRMED' || new Date() >= new Date(reservation.end_time)) return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 400);
    const validation = await validateReservationBase(c.env, user.id, user.role, reservation.external_studio_id, reservation.room_number, reservation.group_id, data.start_time, data.end_time, admin, id);
    if (validation.error) return c.json({ success: false, error: validation.error }, validation.status || 400);
    const conflicts = await getMemberConflicts(c.env, reservation.user_id, reservation.group_id, data.start_time, data.end_time, id);
    if (conflicts.length && !data.acknowledged_member_conflicts) return c.json({ success: false, error: 'MEMBER_RESERVATION_CONFLICT_WARNING', data: conflicts });
    const updateTime = new Date().toISOString();
    const updated = await externalRepository.updateReservationOptimistically({
      id,
      previous: reservation,
      startTime: data.start_time,
      endTime: data.end_time,
      updatedAt: updateTime,
    });
    if (!updated) {
      return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }
    if (!admin && await hasReservationLimitConflict(
      c.env,
      reservation.user_id,
      reservation.group_id,
      data.start_time,
      data.end_time,
      { kind: 'EXTERNAL', id }
    )) {
      await externalRepository.restoreReservation({
        id,
        previous: reservation,
        currentStartTime: data.start_time,
        currentEndTime: data.end_time,
        currentUpdatedAt: updateTime,
        restoredAt: new Date().toISOString(),
      });
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 409);
    }
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
      kind: 'EXTERNAL', reservationId: id, notificationType: 'RESERVATION_EDITED',
      requestedStartTime: reservation.start_time, requestedEndTime: reservation.end_time,
    }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error updating external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.put('/:id/status', async (c) => {
  try {
    requireAdmin(c.get('user').role); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const data = UpdateReservationStatusRequestSchema.parse(await c.req.json());
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    const reservation = await externalRepository.findReservation(id);
    if (!reservation) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    if (reservation.state === data.state) return c.json({ success: true });
    if (data.state === 'CONFIRMED') {
      if (await externalRepository.hasRoomConflict({
        studioId: reservation.external_studio_id,
        roomNumber: reservation.room_number,
        startTime: reservation.start_time,
        endTime: reservation.end_time,
        excludeId: id,
      })) return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }
    const statusUpdated = await externalRepository.updateStatusOptimistically({
      reservation,
      nextState: data.state,
      updatedAt: new Date().toISOString(),
    });
    if (!statusUpdated) {
      return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    const notification = notificationForStatus(data.state);
    if (notification) c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, { kind: 'EXTERNAL', reservationId: id, notificationType: notification }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error updating external reservation status:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.delete('/:id', async (c) => {
  try {
    requireAdmin(c.get('user').role);
    const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);

    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    if (!await externalRepository.existsReservation(id)) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);

    await externalRepository.deleteReservation(id);
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    console.error('Error deleting external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/:id/cancel', async (c) => {
  try {
    const user = c.get('user'); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const admin = c.req.query('admin') === 'true'; if (admin) requireAdmin(user.role);
    const externalRepository = createD1ExternalReservationRepository(c.env.DB);
    const reservation = await externalRepository.findReservation(id);
    if (!reservation) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    const permitted = admin || reservation.user_id === user.id || (reservation.group_id !== null && await createD1GroupMembershipReader(c.env.DB).isUserInGroup(user.id, reservation.group_id));
    if (!permitted || reservation.state !== 'CONFIRMED') return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 403);
    await externalRepository.updateState(id, admin ? 'DECLINED' : 'CANCELLED', new Date().toISOString());
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, { kind: 'EXTERNAL', reservationId: id, notificationType: admin ? 'RESERVATION_REVOKED' : 'RESERVATION_CANCELLED' }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error cancelling external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { externalReservationRoutes, externalStudioRoutes };
