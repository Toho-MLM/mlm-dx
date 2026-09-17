import { validateReservationTime, type HallLottery } from '@shared-schemas';

export function hallLotteryDrawAt(deadline: string): string {
  return new Date(
    new Date(`${deadline}T00:00:00+09:00`).getTime() + 86400000,
  ).toISOString();
}
export function hallLotteryEnd(start: string, minutes: number): string {
  return new Date(new Date(start).getTime() + minutes * 60000).toISOString();
}
export function validHallPreference(
  lottery: HallLottery,
  start: string,
): boolean {
  const day = new Date(new Date(start).getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  return (
    day >= lottery.start_date &&
    day <= lottery.end_date &&
    hallLotteryEnd(start, lottery.duration_minutes) <=
      new Date(`${day}T23:00:00+09:00`).toISOString() &&
    validateReservationTime(
      start,
      hallLotteryEnd(start, lottery.duration_minutes),
      '1970-01-01T00:00:00Z',
    ).isValid
  );
}
export type HallCandidate = {
  id: string;
  group_id: string;
  user_id: string;
  preferences: string[];
};
export type HallOccupied = {
  start_time: string;
  end_time: string;
  group_ids?: string[];
};
export type HallWinner = HallCandidate & {
  rank: number;
  start: string;
  end: string;
};
export function shuffleHallCandidates(
  ids: string[],
  random: () => number,
): string[] {
  const order = [...ids].sort();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
export function drawHallLottery(
  candidates: HallCandidate[],
  orders: string[][],
  duration: number,
  occupied: HallOccupied[],
): HallWinner[] {
  const winners: HallWinner[] = [];
  const blocks = [...occupied];
  for (let rank = 0; rank < 3; rank++) {
    for (const id of orders[rank] ?? []) {
      const candidate = candidates.find((c) => c.id === id);
      if (!candidate || winners.some((w) => w.group_id === candidate.group_id))
        continue;
      const start = candidate.preferences[rank];
      if (!start) continue;
      const end = hallLotteryEnd(start, duration);
      if (
        blocks.some(
          (b) =>
            (!b.group_ids || b.group_ids.includes(candidate.group_id)) &&
            b.start_time < end &&
            b.end_time > start,
        )
      )
        continue;
      winners.push({ ...candidate, rank: rank + 1, start, end });
      blocks.push({ start_time: start, end_time: end });
    }
  }
  return winners;
}
