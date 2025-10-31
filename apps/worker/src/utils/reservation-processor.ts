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

export async function getAvailableIntervals(
  env: Bindings, 
  startTime: string, 
  endTime: string, 
  reservationId: number
): Promise<AvailableInterval[]> {
  const overlappingReservations = await env.DB.prepare(`
    SELECT start_time, end_time
    FROM reservations
    WHERE state = 'CONFIRMED'
      AND start_time < ?
      AND end_time > ?
      ${reservationId > 0 ? 'AND id != ?' : ''}
    ORDER BY start_time ASC
  `).bind(endTime, startTime, ...(reservationId > 0 ? [reservationId] : [])).all();
  
  
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
  reservationId: number, 
  startTime: string, 
  endTime: string
): Promise<ProcessResult> {
  const now = new Date();
  const jstOffset = 9 * 60;
  
  const reservationStart = new Date(startTime);
  const reservationEnd = new Date(endTime);
  
  // 予約日を基準にJSTの時間範囲を設定（UTC時刻をそのまま使用）
  const reservationDateJst = new Date(reservationStart);
  const startOfDayJst = new Date(reservationDateJst);
  startOfDayJst.setHours(6, 0, 0, 0);
  
  const endOfDayJst = new Date(reservationDateJst);
  endOfDayJst.setHours(23, 0, 0, 0);
  
  // 当日の予約かどうかをチェック（UTC時刻で比較）
  const today = new Date(now);
  const isTodayReservation = reservationDateJst.toDateString() === today.toDateString();
  
  if (!isTodayReservation) {
    console.log(`Reservation ${reservationId} is on a different date, keeping as PENDING`);
    return { state: 'PENDING' };
  }
  
  // 当日の予約の場合、時間範囲をチェック（UTC時刻で比較）
  
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

export async function processDailyReservations(env: Bindings): Promise<void> {
  const now = new Date();
  
  // 今日の日付範囲を設定（UTC時刻で）
  const today = new Date(now);
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  
  const startOfDayIso = startOfDay.toISOString();
  const endOfDayIso = endOfDay.toISOString();
  
  console.log(`Processing daily reservations for ${today.toDateString()}`);
  
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
