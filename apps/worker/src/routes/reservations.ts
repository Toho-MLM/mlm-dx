import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { CreateReservationRequestSchema, validateReservationTime, CreateUnavailablePeriodRequestSchema, UnavailablePeriodSchema, CreateReservationLimitRequestSchema, UpdateReservationLimitRequestSchema, ReservationLimitSchema, ReservationSchema, isAdmin, UpdateReservationRequestSchema, UpdateReservationStatusRequestSchema, type ReservationState } from '../../../../lib/shared-schemas';
import { processReservationState, isTodayInJST, getJSTDateString, getAvailableIntervals, validateReservationDateRange } from '../utils/reservation-processor';
import { requireAdmin } from '../utils/admin';
import { broadcastReservationRealtimeEvent } from '../utils/reservation-realtime';
import type { EmailNotificationType } from '../../../../lib/shared-schemas';
import { prepareAndSendReservationEmail } from '../utils/reservation-email';
import { parseUuid } from '../utils/uuid';
import { ZodError } from 'zod';
import { getRemainingIntervalAfterUnavailablePeriod } from '../features/reservations/domain/time';
import { createReservationLimitService, type ReservationLimitScope, type ReservationLimitType } from '../features/reservations/application/limits';
import { createD1ReservationLimitRepository } from '../features/reservations/infrastructure/d1-limit-repository';
import { createD1GroupMembershipReader } from '../features/reservations/infrastructure/d1-membership-reader';
import { createD1HallReservationRepository } from '../features/reservations/infrastructure/d1-hall-repository';
import { createD1ReservationProcessingRepository } from '../features/reservations/infrastructure/d1-processing-repository';

const reservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function isReservationCancellable(
  env: Bindings, 
  userId: string, 
  reservation: { user_id: string; group_id: string | null; state: string }
): Promise<boolean> {
  if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
    return false;
  }
  
  if (reservation.user_id === userId) {
    return true;
  }
  
  if (reservation.group_id) {
    const isInGroup = await createD1GroupMembershipReader(env.DB).isUserInGroup(userId, reservation.group_id);
    if (isInGroup) {
      return true;
    }
  }
  
  return false;
}

async function hasReservationLimitConflict(
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

function notificationForStatus(state: ReservationState): EmailNotificationType | null {
  if (state === 'PENDING') return 'RESERVATION_RECEIVED';
  if (state === 'CONFIRMED') return 'RESERVATION_CONFIRMED';
  if (state === 'COMPLETED') return null;
  return 'RESERVATION_REVOKED';
}

async function getStartedReservationResult(
  env: Bindings,
  reservationId: string,
  startTime: string,
  endTime: string
) {
  const intervals = await getAvailableIntervals(env, startTime, endTime, reservationId);
  const startMs = new Date(startTime).getTime();
  const interval = intervals.find((item) => item.start.getTime() === startMs);
  if (!interval) return null;
  return interval.end.getTime() === new Date(endTime).getTime()
    ? { state: 'CONFIRMED' as const }
    : {
        state: 'CONFIRMED' as const,
        adjustedStartTime: startTime,
        adjustedEndTime: interval.end.toISOString(),
      };
}

async function hasOverlappingReservationLimit(
  env: Bindings,
  scope: ReservationLimitScope,
  limitType: ReservationLimitType,
  startDatetime: string,
  endDatetime: string,
  excludeId?: string
): Promise<boolean> {
  return limitType === 'FIXED'
    && createD1ReservationLimitRepository(env.DB).hasOverlappingFixedLimit(
      scope,
      startDatetime,
      endDatetime,
      excludeId
    );
}

async function hasDuplicateRollingReservationLimit(
  env: Bindings,
  scope: ReservationLimitScope,
  excludeId?: string
): Promise<boolean> {
  return createD1ReservationLimitRepository(env.DB).hasRollingLimit(scope, excludeId);
}

async function getReservationLimitRemaining(
  env: Bindings,
  scope: ReservationLimitScope,
  targetId: string,
  referenceTime: string
) {
  return createReservationLimitService(createD1ReservationLimitRepository(env.DB)).getRemaining({
    scope,
    targetId,
    referenceTime,
  });
}

reservationRoutes.use('*', requireAuth);

reservationRoutes.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const id = c.env.RESERVATION_ROOM.idFromName('global');
  const room = c.env.RESERVATION_ROOM.get(id);
  const typedRoom = room as unknown as {
    fetch(request: globalThis.Request): Promise<globalThis.Response>;
  };
  return await typedRoom.fetch(c.req.raw as unknown as globalThis.Request);
});

reservationRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoIso = twoWeeksAgo.toISOString();

    const reservations = await createD1HallReservationRepository(c.env.DB).listVisibleReservations({
      userId: user.id,
      admin: isAdminMode,
      since: twoWeeksAgoIso,
    });
    return c.json({
      success: true,
      data: reservations.map((reservation) => ReservationSchema.parse({
        ...reservation,
        cancellable: Boolean(reservation.cancellable),
      })),
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});


reservationRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = await c.req.json();
    
    const validatedData = CreateReservationRequestSchema.parse(requestData);
    const { start_time, end_time, group_id, admin: isAdminMode } = validatedData;

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const validation = validateReservationTime(start_time, end_time);
    if (!validation.isValid) {
      return c.json({
        success: false,
        error: validation.error || 'INVALID_RESERVATION_TIME'
      }, 400);
    }

    const dateValidation = validateReservationDateRange(new Date(start_time));
    if (!dateValidation.isValid) {
      return c.json({ success: false, error: dateValidation.error }, 400);
    }

    if (group_id) {
      if (!await createD1GroupMembershipReader(c.env.DB).isActiveGroup(group_id)) {
        return c.json({
          success: false,
          error: 'GROUP_NOT_FOUND'
        }, 400);
      }

      const isMember = isAdminMode || await createD1GroupMembershipReader(c.env.DB).isUserInGroup(user.id, group_id);
      if (!isMember) {
        return c.json({
          success: false,
          error: 'NOT_GROUP_MEMBER'
        }, 403);
      }
    }

    const hallRepository = createD1HallReservationRepository(c.env.DB);
    if (await hallRepository.hasUnavailableOverlap(start_time, end_time)) {
      return c.json({
        success: false,
        error: 'BLOCKED_PERIOD_CONFLICT'
      }, 400);
    }

    const now = new Date().toISOString();
    const reservationId = crypto.randomUUID();

    const userId = user.id;
    const groupId = group_id || null;

    if (!isAdminMode) {
      const isLimitExceeded = await hasReservationLimitConflict(c.env, userId, groupId, start_time, end_time);
      if (isLimitExceeded) {
        return c.json({
          success: false,
          error: 'RESERVATION_LIMIT_EXCEEDED'
        }, 400);
      }
    }

    await hallRepository.createReservation({
      id: reservationId,
      userId,
      groupId,
      startTime: start_time,
      endTime: end_time,
      createdAt: now,
    });

    if (!isAdminMode && await hasReservationLimitConflict(
      c.env,
      userId,
      groupId,
      start_time,
      end_time,
      { kind: 'HALL', id: reservationId }
    )) {
      await hallRepository.deleteReservation(reservationId);
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 409);
    }

    const isSameDay = isTodayInJST(new Date(start_time));
    let notificationType: EmailNotificationType | null = isSameDay ? null : 'RESERVATION_RECEIVED';
    let requestedStartTime: string | undefined;
    let requestedEndTime: string | undefined;

    if (isSameDay) {
      const processResult = await processReservationState(c.env, reservationId, start_time, end_time);
      
      if (processResult.state !== 'PENDING') {
        const updateTime = new Date().toISOString();
        
        if (processResult.adjustedStartTime && processResult.adjustedEndTime) {
          notificationType = 'RESERVATION_ADJUSTED';
          requestedStartTime = start_time;
          requestedEndTime = end_time;
          const processingRepository = createD1ReservationProcessingRepository(c.env.DB);
          const updateResult = await processingRepository.applyHallProcessResult(
            { id: reservationId, start_time, end_time, state: 'PENDING' },
            processResult,
            updateTime
          );
          if (updateResult === 'CONFLICT') {
            await processingRepository.declineHallReservation(reservationId, updateTime);
            notificationType = 'RESERVATION_DECLINED';
          }
        } else {
          notificationType = processResult.state === 'CONFIRMED'
            ? 'RESERVATION_CONFIRMED'
            : 'RESERVATION_DECLINED';
          const processingRepository = createD1ReservationProcessingRepository(c.env.DB);
          const updateResult = await processingRepository.applyHallProcessResult(
            { id: reservationId, start_time, end_time, state: 'PENDING' },
            processResult,
            updateTime
          );
          if (updateResult === 'CONFLICT') {
            await processingRepository.declineHallReservation(reservationId, updateTime);
            notificationType = 'RESERVATION_DECLINED';
          }
        }
      }
    }

    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');

    if (notificationType) {
      c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
        kind: 'HALL',
        reservationId,
        notificationType,
        requestedStartTime,
        requestedEndTime,
      }));
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating reservation:', error);

    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    
    if (error instanceof Error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
      }
      if (error.message.includes('FOREIGN KEY constraint failed')) {
        return c.json({ success: false, error: 'INVALID_USER_OR_GROUP' }, 400);
      }
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const reservationId = parseUuid(c.req.param('id'));
    if (!reservationId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const data = UpdateReservationRequestSchema.parse(await c.req.json());
    const isAdminMode = data.admin === true;
    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const hallRepository = createD1HallReservationRepository(c.env.DB);
    const reservation = await hallRepository.findReservation(reservationId);
    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }
    if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
      return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 400);
    }
    if (!isAdminMode && !await isReservationCancellable(c.env, user.id, reservation)) {
      return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 403);
    }

    const now = new Date();
    const originalStart = new Date(reservation.start_time);
    const originalEnd = new Date(reservation.end_time);
    if (now >= originalEnd) {
      return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 400);
    }

    const nextStart = new Date(data.start_time);
    const nextEnd = new Date(data.end_time);
    const isStarted = now >= originalStart;
    if (
      isStarted
      && (nextStart.getTime() !== originalStart.getTime()
        || getJSTDateString(nextStart) !== getJSTDateString(originalStart))
    ) {
      return c.json({ success: false, error: 'RESERVATION_START_CANNOT_BE_CHANGED' }, 400);
    }
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd <= now) {
      return c.json({ success: false, error: 'RESERVATION_END_MUST_BE_IN_FUTURE' }, 400);
    }
    const normalizedStartTime = nextStart.toISOString();
    const normalizedEndTime = nextEnd.toISOString();

    const validation = validateReservationTime(normalizedStartTime, normalizedEndTime);
    if (!validation.isValid) {
      return c.json({ success: false, error: validation.error || 'INVALID_RESERVATION_TIME' }, 400);
    }
    const dateValidation = validateReservationDateRange(nextStart, now);
    if (!dateValidation.isValid) {
      return c.json({ success: false, error: dateValidation.error }, 400);
    }

    if (await hallRepository.hasUnavailableOverlap(normalizedStartTime, normalizedEndTime)) {
      return c.json({ success: false, error: 'BLOCKED_PERIOD_CONFLICT' }, 400);
    }

    if (!isAdminMode && await hasReservationLimitConflict(
      c.env,
      reservation.user_id,
      reservation.group_id,
      normalizedStartTime,
      normalizedEndTime,
      { kind: 'HALL', id: reservationId }
    )) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 400);
    }

    if (!isTodayInJST(nextStart)) {
      if (await hallRepository.hasConfirmedConflict(reservationId, normalizedStartTime, normalizedEndTime)) {
        return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
      }
    }

    const processResult = isStarted
      ? await getStartedReservationResult(c.env, reservationId, reservation.start_time, normalizedEndTime)
      : await processReservationState(c.env, reservationId, normalizedStartTime, normalizedEndTime);
    if (!processResult) {
      return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }

    const finalStartTime = processResult.adjustedStartTime ?? normalizedStartTime;
    const finalEndTime = processResult.adjustedEndTime ?? normalizedEndTime;
    const updateTime = new Date().toISOString();
    const updated = await hallRepository.updateReservationOptimistically({
      id: reservationId,
      previous: reservation,
      startTime: finalStartTime,
      endTime: finalEndTime,
      state: processResult.state,
      updatedAt: updateTime,
    });
    if (!updated) {
      return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }
    if (!isAdminMode && await hasReservationLimitConflict(
      c.env,
      reservation.user_id,
      reservation.group_id,
      finalStartTime,
      finalEndTime,
      { kind: 'HALL', id: reservationId }
    )) {
      await hallRepository.restoreReservation({
        id: reservationId,
        previous: reservation,
        currentStartTime: finalStartTime,
        currentEndTime: finalEndTime,
        currentState: processResult.state,
        currentUpdatedAt: updateTime,
        restoredAt: new Date().toISOString(),
      });
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 409);
    }

    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
      kind: 'HALL',
      reservationId,
      notificationType: isAdminMode || processResult.adjustedStartTime || processResult.adjustedEndTime
        ? 'RESERVATION_ADJUSTED'
        : 'RESERVATION_EDITED',
      requestedStartTime: reservation.start_time,
      requestedEndTime: reservation.end_time,
    }));
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating reservation:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.put('/:id/status', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);
    const reservationId = parseUuid(c.req.param('id'));
    if (!reservationId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const data = UpdateReservationStatusRequestSchema.parse(await c.req.json());
    const hallRepository = createD1HallReservationRepository(c.env.DB);
    const reservation = await hallRepository.findReservation(reservationId);
    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }
    if (reservation.state === data.state) {
      return c.json({ success: true });
    }

    if (data.state === 'CONFIRMED') {
      if (await hallRepository.hasConfirmedConflict(reservationId, reservation.start_time, reservation.end_time)) {
        return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
      }
    }

    const updated = await hallRepository.updateStatusOptimistically({
      id: reservationId,
      previousState: reservation.state,
      previousUpdatedAt: reservation.updated_at,
      nextState: data.state,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) {
      return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    const notificationType = notificationForStatus(data.state);
    if (notificationType) {
      c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
        kind: 'HALL',
        reservationId,
        notificationType,
      }));
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating reservation status:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.get('/limits', async (c) => {
  try {
    const limits = await createD1ReservationLimitRepository(c.env.DB).listLimits();
    const validatedLimits = limits.map(limit =>
      ReservationLimitSchema.parse(limit)
    );

    return c.json({ success: true, data: validatedLimits });
  } catch (error) {
    console.error('Error fetching reservation limits:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.get('/limits/remaining', async (c) => {
  try {
    const user = c.get('user');
    const scope = c.req.query('scope');
    const targetId = parseUuid(c.req.query('target_id'));
    const referenceTime = c.req.query('reference_time') || new Date().toISOString();

    if ((scope !== 'PERSONAL' && scope !== 'GROUP') || !targetId || Number.isNaN(new Date(referenceTime).getTime())) {
      return c.json({ success: false, error: 'INVALID_PARAMETERS' }, 400);
    }

    if (!isAdmin(user.role)) {
      if (scope === 'PERSONAL' && targetId !== user.id) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }

      if (scope === 'GROUP') {
        const isMember = await createD1GroupMembershipReader(c.env.DB).isUserInGroup(user.id, targetId);
        if (!isMember) {
          return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
        }
      }
    }

    const remaining = await getReservationLimitRemaining(c.env, scope, targetId, referenceTime);

    return c.json({ success: true, data: remaining });
  } catch (error) {
    console.error('Error fetching reservation limit remaining:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.post('/limits', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = await c.req.json();
    const validatedData = CreateReservationLimitRequestSchema.parse(requestData);
    const { scope, limit_type, start_datetime, end_datetime, window_days, max_minutes } = validatedData;

    const isOverlapping = limit_type === 'FIXED' && start_datetime && end_datetime
      ? await hasOverlappingReservationLimit(c.env, scope, limit_type, start_datetime, end_datetime)
      : false;
    if (isOverlapping) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const isDuplicateRolling = limit_type === 'ROLLING'
      ? await hasDuplicateRollingReservationLimit(c.env, scope)
      : false;
    if (isDuplicateRolling) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const now = new Date().toISOString();
    const limitId = crypto.randomUUID();

    await createD1ReservationLimitRepository(c.env.DB).createLimit({
      id: limitId,
      scope,
      limit_type,
      start_datetime: limit_type === 'FIXED' ? start_datetime || null : null,
      end_datetime: limit_type === 'FIXED' ? end_datetime || null : null,
      window_days: limit_type === 'ROLLING' ? window_days || null : null,
      max_minutes,
    }, now);

    await broadcastReservationRealtimeEvent(c.env, 'reservation_limits_changed');

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating reservation limit:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.put('/limits/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const limitId = parseUuid(c.req.param('id'));
    if (!limitId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const requestData = await c.req.json();
    const validatedData = UpdateReservationLimitRequestSchema.parse(requestData);
    const { scope, limit_type, start_datetime, end_datetime, window_days, max_minutes } = validatedData;

    const limitRepository = createD1ReservationLimitRepository(c.env.DB);
    if (!await limitRepository.existsLimit(limitId)) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_NOT_FOUND' }, 404);
    }

    const isOverlapping = limit_type === 'FIXED' && start_datetime && end_datetime
      ? await hasOverlappingReservationLimit(c.env, scope, limit_type, start_datetime, end_datetime, limitId)
      : false;
    if (isOverlapping) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const isDuplicateRolling = limit_type === 'ROLLING'
      ? await hasDuplicateRollingReservationLimit(c.env, scope, limitId)
      : false;
    if (isDuplicateRolling) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const now = new Date().toISOString();

    await limitRepository.updateLimit({
      id: limitId,
      scope,
      limit_type,
      start_datetime: limit_type === 'FIXED' ? start_datetime || null : null,
      end_datetime: limit_type === 'FIXED' ? end_datetime || null : null,
      window_days: limit_type === 'ROLLING' ? window_days || null : null,
      max_minutes,
    }, now);

    await broadcastReservationRealtimeEvent(c.env, 'reservation_limits_changed');

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating reservation limit:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.delete('/limits/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const limitId = parseUuid(c.req.param('id'));
    if (!limitId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const limitRepository = createD1ReservationLimitRepository(c.env.DB);
    if (!await limitRepository.existsLimit(limitId)) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_NOT_FOUND' }, 404);
    }

    await limitRepository.deleteLimit(limitId);

    await broadcastReservationRealtimeEvent(c.env, 'reservation_limits_changed');

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting reservation limit:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.get('/unavailable', async (c) => {
  try {
    const unavailablePeriods = await createD1HallReservationRepository(c.env.DB).listUnavailablePeriods();
    const validatedPeriods = unavailablePeriods.map(period =>
      UnavailablePeriodSchema.parse(period)
    );

    return c.json({ success: true, data: validatedPeriods });
  } catch (error) {
    console.error('Error fetching unavailable periods:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.post('/unavailable', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = await c.req.json();
    const validatedData = CreateUnavailablePeriodRequestSchema.parse(requestData);
    const { start_datetime, end_datetime, reason } = validatedData;

    const now = new Date().toISOString();
    const periodId = crypto.randomUUID();
    const hallRepository = createD1HallReservationRepository(c.env.DB);
    const affectedReservations = await hallRepository.listAffectedReservations(start_datetime, end_datetime);

    const notificationJobs: Array<{
      reservationId: string;
      notificationType: EmailNotificationType;
      requestedStartTime?: string;
      requestedEndTime?: string;
    }> = [];
    const adjustments = [];

    for (const reservation of affectedReservations) {
      const remainingInterval = getRemainingIntervalAfterUnavailablePeriod(
        reservation.start_time,
        reservation.end_time,
        start_datetime,
        end_datetime
      );

      if (remainingInterval) {
        adjustments.push({
          reservationId: reservation.id,
          startTime: remainingInterval.startTime,
          endTime: remainingInterval.endTime,
          decline: false,
        });
        notificationJobs.push({
          reservationId: reservation.id,
          notificationType: 'RESERVATION_ADJUSTED',
          requestedStartTime: reservation.start_time,
          requestedEndTime: reservation.end_time,
        });
      } else {
        adjustments.push({ reservationId: reservation.id, decline: true });
        notificationJobs.push({
          reservationId: reservation.id,
          notificationType: 'RESERVATION_REVOKED',
        });
      }
    }

    await hallRepository.createUnavailablePeriodWithAdjustments({
      id: periodId,
      startTime: start_datetime,
      endTime: end_datetime,
      reason: reason || null,
      createdAt: now,
      adjustments,
    });

    c.executionCtx.waitUntil((async () => {
      for (const job of notificationJobs) {
        await prepareAndSendReservationEmail(c.env, {
          kind: 'HALL',
          ...job,
        });
      }
    })());

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating unavailable period:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    
    if (error instanceof Error) {
      if (error.message === 'INSUFFICIENT_PERMISSIONS') {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.delete('/unavailable/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const periodId = parseUuid(c.req.param('id'));
    if (!periodId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const hallRepository = createD1HallReservationRepository(c.env.DB);
    if (!await hallRepository.existsUnavailablePeriod(periodId)) {
      return c.json({ success: false, error: 'UNAVAILABLE_PERIOD_NOT_FOUND' }, 404);
    }

    await hallRepository.deleteUnavailablePeriod(periodId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting unavailable period:', error);
    
    if (error instanceof Error) {
      if (error.message === 'INSUFFICIENT_PERMISSIONS') {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const reservationId = parseUuid(c.req.param('id'));
    if (!reservationId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const hallRepository = createD1HallReservationRepository(c.env.DB);
    if (!await hallRepository.existsReservation(reservationId)) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }

    await hallRepository.deleteReservation(reservationId);

    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting reservation:', error);

    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.post('/:id/cancel', async (c) => {
  try {
    const user = c.get('user');
    const reservationId = parseUuid(c.req.param('id'));
    if (!reservationId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const hallRepository = createD1HallReservationRepository(c.env.DB);
    const reservation = await hallRepository.findReservation(reservationId);

    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }

    if (isAdminMode) {
      if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
        return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 400);
      }

      const now = new Date().toISOString();

      await hallRepository.updateState(reservationId, 'DECLINED', now);

      await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');

      c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
        kind: 'HALL',
        reservationId,
        notificationType: 'RESERVATION_REVOKED',
      }));

      return c.json({ success: true });
    } else {
      const cancellable = await isReservationCancellable(c.env, user.id, reservation);
      if (!cancellable) {
        return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 403);
      }

      const now = new Date().toISOString();

      await hallRepository.updateState(reservationId, 'CANCELLED', now);

      await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');

      c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
        kind: 'HALL',
        reservationId,
        notificationType: 'RESERVATION_CANCELLED',
      }));

      return c.json({ success: true });
    }
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});



export { reservationRoutes };
