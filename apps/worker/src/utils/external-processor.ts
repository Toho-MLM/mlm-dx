import type { Bindings } from '../index';
import { broadcastReservationRealtimeEvent } from './reservation-realtime';
import { getJSTDateString, getJSTDayRange, getJSTTimeRange, isTodayInJST, selectLongestInterval, type AvailableInterval, type ProcessResult } from './reservation-processor';

export async function getAvailableExternalIntervals(
  env: Bindings,
  externalStudioId: string,
  startTime: string,
  endTime: string,
  reservationId: string | number
): Promise<AvailableInterval[]> {
  const hasReservationId = reservationId !== 0 && reservationId !== '';
  const overlappingReservations = await env.DB.prepare(`
    SELECT start_time, end_time
    FROM external_reservations
    WHERE external_studio_id = ?
      AND state = 'CONFIRMED'
      AND start_time < ?
      AND end_time > ?
      ${hasReservationId ? 'AND id != ?' : ''}
    ORDER BY start_time ASC
  `).bind(externalStudioId, endTime, startTime, ...(hasReservationId ? [reservationId] : [])).all<{ start_time: string; end_time: string }>();

  const reservationStart = new Date(startTime);
  const reservationEnd = new Date(endTime);
  const available: AvailableInterval[] = [];
  let currentStart = new Date(reservationStart);

  overlappingReservations.results.forEach((res) => {
    const slotStart = new Date(res.start_time);
    const slotEnd = new Date(res.end_time);

    if (slotStart > currentStart) {
      available.push({ start: new Date(currentStart), end: new Date(slotStart) });
    }
    currentStart = new Date(Math.max(currentStart.getTime(), slotEnd.getTime()));
  });

  if (currentStart < reservationEnd) {
    available.push({ start: new Date(currentStart), end: new Date(reservationEnd) });
  }

  return available;
}

export async function processExternalReservationState(
  env: Bindings,
  externalStudioId: string,
  reservationId: string | number,
  startTime: string,
  endTime: string
): Promise<ProcessResult> {
  const reservationStart = new Date(startTime);
  const reservationEnd = new Date(endTime);
  const reservationDateJST = getJSTDateString(reservationStart);

  if (!isTodayInJST(reservationStart)) {
    return { state: 'PENDING' };
  }

  const timeRange = getJSTTimeRange(reservationDateJST, 6, 23);
  if (reservationStart < timeRange.startUTC || reservationEnd > timeRange.endUTC) {
    return { state: 'DECLINED' };
  }

  const availableIntervals = await getAvailableExternalIntervals(env, externalStudioId, startTime, endTime, reservationId);
  const longestInterval = selectLongestInterval(availableIntervals);

  if (!longestInterval) {
    return { state: 'DECLINED' };
  }

  const isFullRange = longestInterval.start.getTime() === reservationStart.getTime()
    && longestInterval.end.getTime() === reservationEnd.getTime();

  if (isFullRange) {
    return { state: 'CONFIRMED' };
  }

  return {
    state: 'CONFIRMED',
    adjustedStartTime: longestInterval.start.toISOString(),
    adjustedEndTime: longestInterval.end.toISOString(),
  };
}

export async function processTodayExternalReservations(env: Bindings): Promise<number> {
  const todayJST = getJSTDateString(new Date());
  const dayRange = getJSTDayRange(todayJST);
  const pendingReservations = await env.DB.prepare(`
    SELECT id, external_studio_id, start_time, end_time
    FROM external_reservations
    WHERE state = 'PENDING'
      AND start_time >= ?
      AND start_time <= ?
    ORDER BY start_time ASC
  `).bind(dayRange.startUTC.toISOString(), dayRange.endUTC.toISOString()).all<{
    id: string;
    external_studio_id: string;
    start_time: string;
    end_time: string;
  }>();

  let changedCount = 0;

  for (const reservation of pendingReservations.results) {
    const processResult = await processExternalReservationState(
      env,
      reservation.external_studio_id,
      reservation.id,
      reservation.start_time,
      reservation.end_time
    );

    if (processResult.state === 'PENDING') {
      continue;
    }

    const now = new Date().toISOString();
    if (processResult.adjustedStartTime && processResult.adjustedEndTime) {
      await env.DB.prepare(`
        UPDATE external_reservations
        SET state = ?, start_time = ?, end_time = ?, updated_at = ?
        WHERE id = ?
      `).bind(processResult.state, processResult.adjustedStartTime, processResult.adjustedEndTime, now, reservation.id).run();
    } else {
      await env.DB.prepare(`
        UPDATE external_reservations
        SET state = ?, updated_at = ?
        WHERE id = ?
      `).bind(processResult.state, now, reservation.id).run();
    }
    changedCount += 1;
  }

  if (changedCount > 0) {
    await broadcastReservationRealtimeEvent(env, 'reservations_changed');
  }

  return changedCount;
}

export async function processPastExternalReservations(env: Bindings): Promise<number> {
  const todayJST = getJSTDateString(new Date());
  const todayRange = getJSTDayRange(todayJST);
  const startOfTodayIso = todayRange.startUTC.toISOString();
  const updateTime = new Date().toISOString();
  const targetCount = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM external_reservations
    WHERE state IN ('CONFIRMED', 'PENDING')
      AND end_time < ?
  `).bind(startOfTodayIso).first<{ count: number }>();

  await env.DB.prepare(`
    UPDATE external_reservations
    SET state = 'COMPLETED', updated_at = ?
    WHERE state IN ('CONFIRMED', 'PENDING')
      AND end_time < ?
  `).bind(updateTime, startOfTodayIso).run();

  const changedCount = Number(targetCount?.count ?? 0);
  if (changedCount > 0) {
    await broadcastReservationRealtimeEvent(env, 'reservations_changed');
  }

  return changedCount;
}

export async function deleteExpiredExternals(env: Bindings): Promise<number> {
  const now = new Date().toISOString();
  const expired = await env.DB.prepare(`
    SELECT id
    FROM external_studios
    WHERE end_datetime < ?
  `).bind(now).all<{ id: string }>();

  if (expired.results.length === 0) {
    return 0;
  }

  const ids = expired.results.map((item) => item.id);
  for (const id of ids) {
    await env.DB.prepare('DELETE FROM external_reservations WHERE external_studio_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM external_studios WHERE id = ?').bind(id).run();
  }

  await broadcastReservationRealtimeEvent(env, 'reservations_changed');
  return ids.length;
}
