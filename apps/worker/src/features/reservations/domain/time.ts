export type TimeInterval = {
  start: Date;
  end: Date;
};

export type StoredTimeInterval = {
  start_time: string;
  end_time: string;
};

export type ReservationProcessResult = {
  state: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  adjustedStartTime?: string;
  adjustedEndTime?: string;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getJSTDateString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().split('T')[0];
}

export function isTodayInJST(date: Date, now = new Date()): boolean {
  return getJSTDateString(date) === getJSTDateString(now);
}

export function validateReservationDateRange(
  reservationDate: Date,
  now = new Date()
): { isValid: true } | { isValid: false; error: 'RESERVATION_DATE_IN_PAST' | 'RESERVATION_DATE_TOO_FAR' } {
  const reservationDateJST = getJSTDateString(reservationDate);
  const todayJST = getJSTDateString(now);
  const maxDate = new Date(`${todayJST}T00:00:00+09:00`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 14);
  const maxDateJST = getJSTDateString(maxDate);

  if (reservationDateJST < todayJST) {
    return { isValid: false, error: 'RESERVATION_DATE_IN_PAST' };
  }
  if (reservationDateJST > maxDateJST) {
    return { isValid: false, error: 'RESERVATION_DATE_TOO_FAR' };
  }

  return { isValid: true };
}

export function getJSTTimeRange(
  jstDateString: string,
  startHour: number,
  endHour: number,
  endMinutes = 0,
  endSeconds = 0,
  endMs = 0
): { startUTC: Date; endUTC: Date } {
  return {
    startUTC: new Date(`${jstDateString}T${String(startHour).padStart(2, '0')}:00:00+09:00`),
    endUTC: new Date(
      `${jstDateString}T${String(endHour).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:${String(endSeconds).padStart(2, '0')}.${String(endMs).padStart(3, '0')}+09:00`
    ),
  };
}

export function getJSTDayRange(jstDateString: string): { startUTC: Date; endUTC: Date } {
  return getJSTTimeRange(jstDateString, 0, 23, 59, 59, 999);
}

export function selectLongestInterval(intervals: TimeInterval[]): TimeInterval | null {
  if (intervals.length === 0) return null;
  return intervals.reduce((longest, current) => (
    current.end.getTime() - current.start.getTime()
      > longest.end.getTime() - longest.start.getTime()
      ? current
      : longest
  ));
}

export function subtractOccupiedIntervals(
  startTime: string,
  endTime: string,
  occupied: StoredTimeInterval[]
): TimeInterval[] {
  const rangeStart = new Date(startTime);
  const rangeEnd = new Date(endTime);
  const available: TimeInterval[] = [];
  let cursor = new Date(rangeStart);

  const sorted = [...occupied].sort((a, b) => a.start_time.localeCompare(b.start_time));
  for (const item of sorted) {
    const occupiedStart = new Date(Math.max(rangeStart.getTime(), new Date(item.start_time).getTime()));
    const occupiedEnd = new Date(Math.min(rangeEnd.getTime(), new Date(item.end_time).getTime()));
    if (occupiedEnd <= cursor || occupiedStart >= rangeEnd) continue;
    if (occupiedStart > cursor) {
      available.push({ start: new Date(cursor), end: occupiedStart });
    }
    if (occupiedEnd > cursor) cursor = occupiedEnd;
  }

  if (cursor < rangeEnd) {
    available.push({ start: cursor, end: new Date(rangeEnd) });
  }
  return available;
}

export function determineHallReservationState(
  startTime: string,
  endTime: string,
  occupied: StoredTimeInterval[],
  now = new Date()
): ReservationProcessResult {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!isTodayInJST(start, now)) return { state: 'PENDING' };

  const businessHours = getJSTTimeRange(getJSTDateString(start), 6, 23);
  if (start < businessHours.startUTC || end > businessHours.endUTC) {
    return { state: 'DECLINED' };
  }

  const longest = selectLongestInterval(subtractOccupiedIntervals(startTime, endTime, occupied));
  if (!longest) return { state: 'DECLINED' };
  if (longest.start.getTime() === start.getTime() && longest.end.getTime() === end.getTime()) {
    return { state: 'CONFIRMED' };
  }
  return {
    state: 'CONFIRMED',
    adjustedStartTime: longest.start.toISOString(),
    adjustedEndTime: longest.end.toISOString(),
  };
}

export function calculateOverlapMinutes(
  startTime: string,
  endTime: string,
  rangeStartTime: string,
  rangeEndTime: string
): number {
  const overlapStart = Math.max(new Date(startTime).getTime(), new Date(rangeStartTime).getTime());
  const overlapEnd = Math.min(new Date(endTime).getTime(), new Date(rangeEndTime).getTime());
  return overlapEnd <= overlapStart ? 0 : Math.ceil((overlapEnd - overlapStart) / 60000);
}

export function getRollingWindow(referenceTime: string, windowDays: number): { startTime: string; endTime: string } {
  const end = new Date(referenceTime);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

export function getReferenceDayRange(referenceTime: string): { startTime: string; endTime: string } {
  const { startUTC, endUTC } = getJSTDayRange(getJSTDateString(new Date(referenceTime)));
  return { startTime: startUTC.toISOString(), endTime: endUTC.toISOString() };
}

export function getRemainingIntervalAfterUnavailablePeriod(
  reservationStartTime: string,
  reservationEndTime: string,
  unavailableStartTime: string,
  unavailableEndTime: string
): { startTime: string; endTime: string } | null {
  const reservationStart = new Date(reservationStartTime);
  const reservationEnd = new Date(reservationEndTime);
  const unavailableStart = new Date(unavailableStartTime);
  const unavailableEnd = new Date(unavailableEndTime);
  const remaining: TimeInterval[] = [];

  if (reservationStart < unavailableStart) {
    const beforeEnd = new Date(Math.min(reservationEnd.getTime(), unavailableStart.getTime()));
    if (reservationStart < beforeEnd) remaining.push({ start: reservationStart, end: beforeEnd });
  }
  if (unavailableEnd < reservationEnd) {
    const afterStart = new Date(Math.max(reservationStart.getTime(), unavailableEnd.getTime()));
    if (afterStart < reservationEnd) remaining.push({ start: afterStart, end: reservationEnd });
  }

  const longest = selectLongestInterval(remaining);
  if (!longest || longest.end.getTime() - longest.start.getTime() < 10 * 60 * 1000) return null;
  return { startTime: longest.start.toISOString(), endTime: longest.end.toISOString() };
}
