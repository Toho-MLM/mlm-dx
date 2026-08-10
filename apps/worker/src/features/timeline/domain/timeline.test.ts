import { describe, expect, it } from 'vitest';
import { validateTimeline } from './timeline';

describe('validateTimeline', () => {
  it('連番かつ重複のないタイムラインを受け入れる', () => {
    expect(validateTimeline([
      { entryId: 'a', position: 1, startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T01:00:00.000Z' },
      { entryId: 'b', position: 2 },
      { entryId: 'c', position: null },
    ])).toBeNull();
  });

  it('重複した順番を拒否する', () => {
    expect(validateTimeline([
      { entryId: 'a', position: 1 },
      { entryId: 'b', position: 1 },
    ])).toBe('DUPLICATE_POSITION');
  });

  it('開始時刻が終了時刻以降なら拒否する', () => {
    expect(validateTimeline([
      { entryId: 'a', position: 1, startTime: '2026-01-01T01:00:00.000Z', endTime: '2026-01-01T01:00:00.000Z' },
    ])).toBe('INVALID_TIME_RANGE');
  });

  it('欠番を拒否する', () => {
    expect(validateTimeline([{ entryId: 'a', position: 2 }])).toBe('INVALID_POSITION_SEQUENCE');
  });
});

