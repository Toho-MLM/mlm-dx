import type { Bindings } from '../index';

export interface ProcessResult {
  state: string;
  adjustedStartTime?: string;
  adjustedEndTime?: string;
}

export interface AvailableInterval {
  start: Date;
  end: Date;
}

export function getJSTDateString(date: Date): string {
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jstDate.toISOString().split('T')[0];
}

export function isTodayInJST(date: Date): boolean {
  const dateJST = getJSTDateString(date);
  const todayJST = getJSTDateString(new Date());
  return dateJST === todayJST;
}

export function getJSTTimeRange(jstDateString: string, startHour: number, endHour: number, endMinutes: number = 0, endSeconds: number = 0, endMs: number = 0): { startUTC: Date; endUTC: Date } {
  const jstStart = new Date(`${jstDateString}T${String(startHour).padStart(2, '0')}:00:00+09:00`);
  const jstEnd = new Date(`${jstDateString}T${String(endHour).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:${String(endSeconds).padStart(2, '0')}.${String(endMs).padStart(3, '0')}+09:00`);
  return {
    startUTC: jstStart,
    endUTC: jstEnd
  };
}

export function getJSTDayRange(jstDateString: string): { startUTC: Date; endUTC: Date } {
  return getJSTTimeRange(jstDateString, 0, 23, 59, 59, 999);
}

export async function getAvailableIntervals(
  env: Bindings, 
  startTime: string, 
  endTime: string, 
  reservationId: number | string
): Promise<AvailableInterval[]> {
  const hasReservationId = reservationId !== 0 && reservationId !== '';
  const overlappingReservations = await env.DB.prepare(`
    SELECT start_time, end_time
    FROM reservations
    WHERE state = 'CONFIRMED'
      AND start_time < ?
      AND end_time > ?
      ${hasReservationId ? 'AND id != ?' : ''}
    ORDER BY start_time ASC
  `).bind(endTime, startTime, ...(hasReservationId ? [reservationId] : [])).all();
  
  
  const reservationStart = new Date(startTime);
  const reservationEnd = new Date(endTime);
  const available: AvailableInterval[] = [];
  let currentStart = new Date(reservationStart);
  
  overlappingReservations.results.forEach((res: any) => {
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

export function selectLongestInterval(intervals: AvailableInterval[]): AvailableInterval | null {
  if (intervals.length === 0) return null;
  return intervals.reduce((prev, current) => {
    const prevDuration = prev.end.getTime() - prev.start.getTime();
    const currentDuration = current.end.getTime() - current.start.getTime();
    return currentDuration > prevDuration ? current : prev;
  });
}

export async function processReservationState(
  env: Bindings, 
  reservationId: number | string, 
  startTime: string, 
  endTime: string
): Promise<ProcessResult> {
  const now = new Date();
  const reservationStart = new Date(startTime);
  const reservationEnd = new Date(endTime);
  
  const reservationDateJST = getJSTDateString(reservationStart);
  const isTodayReservation = isTodayInJST(reservationStart);
  
  const timeRange = getJSTTimeRange(reservationDateJST, 6, 23);
  const startOfDayJst = timeRange.startUTC;
  const endOfDayJst = timeRange.endUTC;
  
  if (!isTodayReservation) {
    console.log(`Reservation ${reservationId} is on a different date, keeping as PENDING`);
    return { state: 'PENDING' };
  }
  
  if (reservationStart < startOfDayJst || reservationEnd > endOfDayJst) {
    console.log(`Reservation ${reservationId} is outside allowed time range, setting to DECLINED`);
    return { state: 'DECLINED' };
  }
  
  // 当日の予約の場合、即座に重複チェックを実行
  console.log(`Processing same-day reservation ${reservationId} for immediate conflict check`);
  
  const availableIntervals = await getAvailableIntervals(env, startTime, endTime, reservationId);
  const longestInterval = selectLongestInterval(availableIntervals);
  
  if (longestInterval) {
    const isFullRange = (longestInterval.start.getTime() === reservationStart.getTime()) &&
                        (longestInterval.end.getTime() === reservationEnd.getTime());
    
    if (isFullRange) {
      console.log(`Same-day reservation ${reservationId} has no conflicts, setting to CONFIRMED`);
      return { state: 'CONFIRMED' };
    } else {
      console.log(`Same-day reservation ${reservationId} partially available, adjusting time and setting to CONFIRMED`);
      return { 
        state: 'CONFIRMED',
        adjustedStartTime: longestInterval.start.toISOString(),
        adjustedEndTime: longestInterval.end.toISOString()
      };
    }
  } else {
    console.log(`Same-day reservation ${reservationId} has no available time slots, setting to DECLINED`);
    return { state: 'DECLINED' };
  }
}

export async function processTodayReservations(env: Bindings): Promise<void> {
  const now = new Date();
  const todayJST = getJSTDateString(now);
  
  const dayRange = getJSTDayRange(todayJST);
  const startOfDayIso = dayRange.startUTC.toISOString();
  const endOfDayIso = dayRange.endUTC.toISOString();
  
  console.log(`Processing daily reservations for JST ${todayJST}`);
  
  const pendingReservations = await env.DB.prepare(`
    SELECT id, start_time, end_time, state
    FROM reservations
    WHERE state = 'PENDING'
      AND start_time >= ?
      AND start_time <= ?
    ORDER BY start_time ASC
  `).bind(startOfDayIso, endOfDayIso).all();
  
  console.log(`Found ${pendingReservations.results.length} pending reservations for today`);
  
  for (const reservation of pendingReservations.results as any[]) {
    try {
      const processResult = await processReservationState(
        env, 
        reservation.id, 
        reservation.start_time, 
        reservation.end_time
      );
      
      if (processResult.state !== 'PENDING') {
        const updateTime = new Date().toISOString();
        
        if (processResult.adjustedStartTime && processResult.adjustedEndTime) {
          await env.DB.prepare(`
            UPDATE reservations 
            SET state = ?, start_time = ?, end_time = ?, updated_at = ?
            WHERE id = ?
          `).bind(
            processResult.state, 
            processResult.adjustedStartTime, 
            processResult.adjustedEndTime, 
            updateTime, 
            reservation.id
          ).run();
          
          console.log(`Updated reservation ${reservation.id} to ${processResult.state} with adjusted time`);
        } else {
          await env.DB.prepare(`
            UPDATE reservations 
            SET state = ?, updated_at = ?
            WHERE id = ?
          `).bind(processResult.state, updateTime, reservation.id).run();
          
          console.log(`Updated reservation ${reservation.id} to ${processResult.state}`);
        }
      }
    } catch (error) {
      console.error(`Error processing reservation ${reservation.id}:`, error);
    }
  }
  
  console.log('Daily reservation processing completed');
}

export async function processYesterdayReservations(env: Bindings): Promise<void> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ymd = getJSTDateString(yesterday);
  const range = getJSTDayRange(ymd);
  const startIso = range.startUTC.toISOString();
  const endIso = range.endUTC.toISOString();
  const confirmed = await env.DB.prepare(`
    SELECT id FROM reservations
    WHERE state = 'CONFIRMED'
      AND start_time >= ?
      AND start_time <= ?
  `).bind(startIso, endIso).all();
  const updateTime = new Date().toISOString();
  for (const r of confirmed.results as any[]) {
    await env.DB.prepare(`
      UPDATE reservations SET state = 'COMPLETED', updated_at = ? WHERE id = ?
    `).bind(updateTime, r.id).run();
  }
}

export async function deleteOldReservations(env: Bindings): Promise<void> {
  const now = new Date();
  now.setUTCHours(15, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  await env.DB.prepare(`
    DELETE FROM reservations WHERE end_time < ?
  `).bind(cutoff.toISOString()).run();
}
