import { describe, expect, it } from 'vitest';
import {
  CreateHallLotteryApplicationRequestSchema,
  type HallLottery,
} from '@shared-schemas';
import {
  drawHallLottery,
  hallLotteryDrawAt,
  shuffleHallCandidates,
  validHallPreference,
} from './hall-lottery';
const lottery: HallLottery = {
  id: 'l',
  name: '秋',
  start_date: '2026-10-01',
  end_date: '2026-10-05',
  deadline_date: '2026-09-25',
  duration_minutes: 120,
  target_band_type: 'FREE',
  draw_at: '2026-09-25T15:00:00.000Z',
  state: 'OPEN',
};
const t = (day: number, hour: number) =>
  new Date(
    `2026-10-0${day}T${String(hour).padStart(2, '0')}:00:00+09:00`,
  ).toISOString();
const candidate = (id: string, preferences: string[]) => ({
  id,
  group_id: id,
  user_id: id,
  preferences,
});
describe('期間単位のホール抽選', () => {
  it('締切日の翌日0:00 JST（UTCは前日15時）に抽選', () => {
    expect(hallLotteryDrawAt('2026-09-25')).toBe('2026-09-25T15:00:00.000Z');
    expect(hallLotteryDrawAt('2026-12-31')).toBe('2026-12-31T15:00:00.000Z');
  });
  it('全バンドの第1希望を先に処理し、複数日でも1バンド最大1枠', () => {
    const candidates = [
      candidate('a', [t(1, 6), t(2, 6)]),
      candidate('b', [t(1, 6), t(2, 6), t(3, 6)]),
      candidate('c', [t(2, 6)]),
    ];
    expect(
      drawHallLottery(
        candidates,
        [
          ['a', 'b', 'c'],
          ['a', 'b', 'c'],
          ['a', 'b', 'c'],
        ],
        120,
        [],
      ).map((w) => [w.id, w.rank, w.start]),
    ).toEqual([
      ['a', 1, t(1, 6)],
      ['c', 1, t(2, 6)],
      ['b', 3, t(3, 6)],
    ]);
  });
  it('既存予約・予約不可・メンバー競合を避け、移動や短縮をしない', () => {
    const result = drawHallLottery(
      [candidate('a', [t(1, 6), t(2, 6), t(3, 6)]), candidate('b', [t(4, 6)])],
      [
        ['a', 'b'],
        ['a', 'b'],
        ['a', 'b'],
      ],
      120,
      [
        { start_time: t(1, 7), end_time: t(1, 8) },
        { start_time: t(2, 6), end_time: t(2, 7) },
        { start_time: t(3, 6), end_time: t(3, 8), group_ids: ['a'] },
        { start_time: t(4, 6), end_time: t(4, 8), group_ids: ['a'] },
      ],
    );
    expect(result.map((w) => [w.id, w.start, w.end])).toEqual([
      ['b', t(4, 6), t(4, 8)],
    ]);
  });
  it('同じ日時は拒否し、部分的に重なる希望は許可', () => {
    const group_id = '00000000-0000-4000-8000-000000000001';
    expect(
      CreateHallLotteryApplicationRequestSchema.safeParse({
        group_id,
        preferences: [t(1, 6), t(1, 6)],
      }).success,
    ).toBe(false);
    expect(
      CreateHallLotteryApplicationRequestSchema.safeParse({
        group_id,
        preferences: [t(1, 6), t(1, 7)],
      }).success,
    ).toBe(true);
  });
  it('対象期間と6〜23時の境界を守り、14日上限や現在時刻には依存しない', () => {
    expect(validHallPreference(lottery, t(1, 6))).toBe(true);
    expect(validHallPreference(lottery, t(5, 21))).toBe(true);
    expect(validHallPreference(lottery, t(1, 5))).toBe(false);
    expect(validHallPreference(lottery, t(5, 22))).toBe(false);
    expect(validHallPreference(lottery, t(6, 6))).toBe(false);
    expect(validHallPreference(lottery, '2026-10-05T21:00:01+09:00')).toBe(
      false,
    );
  });
  it('固定乱数で再現し、2バンドはどちらも先頭になれる', () => {
    expect(shuffleHallCandidates(['b', 'a'], () => 0)).toEqual(['b', 'a']);
    expect(shuffleHallCandidates(['b', 'a'], () => 0.99)).toEqual(['a', 'b']);
    const permutations = new Set<string>();
    for (const a of [0, 0.34, 0.67])
      for (const b of [0, 0.5]) {
        let i = 0;
        permutations.add(
          shuffleHallCandidates(['a', 'b', 'c'], () => [a, b][i++]).join(''),
        );
      }
    expect(permutations.size).toBe(6);
  });
});
