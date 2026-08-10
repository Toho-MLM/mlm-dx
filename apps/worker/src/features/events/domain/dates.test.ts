import { describe, expect, it } from 'vitest';
import { validateEventDates } from './dates';

describe('event dates', () => {
  it('entry期限、setlist期限、開催日の順序を検証する', () => {
    expect(validateEventDates('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z', '2026-08-03T00:00:00Z')).toBe(true);
    expect(validateEventDates('2026-08-02T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z')).toBe(false);
    expect(validateEventDates('2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z', '2026-08-03T00:00:00Z')).toBe(false);
  });
});
