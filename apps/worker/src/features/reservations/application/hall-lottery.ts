import type {
  CreateHallLotteryRequest,
  HallLottery,
  HallLotteryApplication,
  HallLotteryBandType,
} from '@shared-schemas';
import {
  drawHallLottery,
  hallLotteryDrawAt,
  shuffleHallCandidates,
  validHallPreference,
  type HallOccupied,
  type HallWinner,
} from '../domain/hall-lottery';
export class HallLotteryError extends Error {}
export interface HallLotteryRepository {
  list(): Promise<HallLottery[]>;
  find(id: string): Promise<HallLottery | null>;
  create(lottery: HallLottery, now: string): Promise<boolean>;
  applications(id: string, userId?: string): Promise<HallLotteryApplication[]>;
  isMember(userId: string, groupId: string): Promise<boolean>;
  getActiveGroupBandType(groupId: string): Promise<HallLotteryBandType | null>;
  eligibleApplicationIds(lotteryId: string): Promise<string[]>;
  apply(input: {
    id: string;
    lotteryId: string;
    groupId: string;
    userId: string;
    preferences: string[];
    now: string;
  }): Promise<boolean>;
  cancelApplication(
    id: string,
    userId: string,
    now: string,
    admin?: boolean,
  ): Promise<boolean>;
  cancel(id: string): Promise<boolean>;
  beginDraw(
    id: string,
    order: string[][],
    now: string,
  ): Promise<string[][] | null>;
  occupied(id: string): Promise<HallOccupied[]>;
  commit(
    id: string,
    winners: (HallWinner & { reservationId: string })[],
    now: string,
  ): Promise<void>;
}
export function createHallLotteryService(deps: {
  repository: HallLotteryRepository;
  now: () => Date;
  id: () => string;
  random: () => number;
  notify: (reservationId: string) => Promise<void>;
  broadcast: () => Promise<void>;
}) {
  const repo = deps.repository;
  return {
    async create(input: CreateHallLotteryRequest) {
      const draw_at = hallLotteryDrawAt(input.deadline_date);
      if (draw_at <= deps.now().toISOString())
        throw new HallLotteryError('LOTTERY_CLOSED');
      const lottery: HallLottery = {
        ...input,
        id: deps.id(),
        draw_at,
        state: 'OPEN',
      };
      if (!(await repo.create(lottery, deps.now().toISOString())))
        throw new HallLotteryError('LOTTERY_PERIOD_OVERLAP');
      await deps.broadcast();
      return lottery;
    },
    async apply(
      lotteryId: string,
      userId: string,
      groupId: string,
      preferences: string[],
      admin = false,
    ) {
      const lottery = await repo.find(lotteryId);
      if (!lottery) throw new HallLotteryError('LOTTERY_NOT_FOUND');
      if (
        lottery.state !== 'OPEN' ||
        deps.now().toISOString() >= lottery.draw_at
      )
        throw new HallLotteryError('LOTTERY_CLOSED');
      const bandType = await repo.getActiveGroupBandType(groupId);
      if (!bandType) throw new HallLotteryError('GROUP_NOT_FOUND');
      if (bandType !== lottery.target_band_type)
        throw new HallLotteryError('HALL_LOTTERY_BAND_TYPE_MISMATCH');
      if (!admin && !(await repo.isMember(userId, groupId)))
        throw new HallLotteryError('NOT_GROUP_MEMBER');
      if (
        !preferences.length ||
        preferences.length > 3 ||
        new Set(preferences).size !== preferences.length ||
        preferences.some((p) => !validHallPreference(lottery, p))
      )
        throw new HallLotteryError('INVALID_INPUT');
      const id = deps.id();
      if (
        !(await repo.apply({
          id,
          lotteryId,
          groupId,
          userId,
          preferences,
          now: deps.now().toISOString(),
        }))
      )
        throw new HallLotteryError('HALL_LOTTERY_APPLICATION_CONFLICT');
      return { id };
    },
    async cancelApplication(id: string, userId: string, admin = false) {
      if (
        !(await repo.cancelApplication(
          id,
          userId,
          deps.now().toISOString(),
          admin,
        ))
      )
        throw new HallLotteryError('LOTTERY_CANNOT_CANCEL');
    },
    async cancel(id: string) {
      if (!(await repo.cancel(id)))
        throw new HallLotteryError('LOTTERY_CANNOT_CANCEL');
      await deps.broadcast();
    },
    async processDue() {
      for (const lottery of await repo.list()) {
        if (
          !['OPEN', 'DRAWING'].includes(lottery.state) ||
          lottery.draw_at > deps.now().toISOString()
        )
          continue;
        try {
          const candidates = (await repo.applications(lottery.id)).filter(
            (a) => a.state === 'PENDING',
          );
          const orders = await repo.beginDraw(
            lottery.id,
            Array.from({ length: 3 }, () =>
              shuffleHallCandidates(
                candidates.map((c) => c.id),
                deps.random,
              ),
            ),
            deps.now().toISOString(),
          );
          if (!orders) continue;
          // Read again after claiming: all application mutations require OPEN.
          const eligibleIds = new Set(
            await repo.eligibleApplicationIds(lottery.id),
          );
          const current = (await repo.applications(lottery.id)).filter(
            (a) => a.state === 'PENDING' && eligibleIds.has(a.id),
          );
          const winners = drawHallLottery(
            current,
            orders,
            lottery.duration_minutes,
            await repo.occupied(lottery.id),
          ).map((w) => ({ ...w, reservationId: deps.id() }));
          await repo.commit(lottery.id, winners, deps.now().toISOString());
          await deps.broadcast();
          for (const winner of winners) await deps.notify(winner.reservationId);
        } catch (error) {
          console.error('Hall lottery draw failed', lottery.id, error);
        }
      }
    },
  };
}
