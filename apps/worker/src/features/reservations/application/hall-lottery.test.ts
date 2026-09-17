import { describe, expect, it, vi } from 'vitest';
import type { HallLottery, HallLotteryApplication } from '@shared-schemas';
import {
  createHallLotteryService,
  type HallLotteryRepository,
} from './hall-lottery';
function setup() {
  let time = new Date('2026-09-25T14:59:59.999Z');
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
  let order: string[][] | null = null;
  const apps: HallLotteryApplication[] = [];
  const repository: HallLotteryRepository = {
    list: async () => [lottery],
    find: async () => lottery,
    create: async () => true,
    isMember: async () => true,
    getActiveGroupBandType: async () => 'FREE',
    eligibleApplicationIds: async () =>
      apps.filter((a) => a.state === 'PENDING').map((a) => a.id),
    applications: async () => apps,
    apply: async (i) => {
      if (
        apps.some((a) => a.group_id === i.groupId && a.state !== 'CANCELLED') ||
        lottery.state !== 'OPEN'
      )
        return false;
      apps.push({
        id: i.id,
        lottery_id: i.lotteryId,
        group_id: i.groupId,
        user_id: i.userId,
        group_name: i.groupId,
        preferences: i.preferences,
        state: 'PENDING',
        winning_rank: null,
        reservation_id: null,
        assigned_start: null,
        assigned_end: null,
      });
      return true;
    },
    cancelApplication: async (id) => {
      const a = apps.find((a) => a.id === id);
      if (!a || time.toISOString() >= lottery.draw_at) return false;
      a.state = 'CANCELLED';
      return true;
    },
    cancel: async () => {
      if (lottery.state !== 'OPEN') return false;
      lottery.state = 'CANCELLED';
      apps.forEach((a) => {
        a.state = 'CANCELLED';
      });
      return true;
    },
    beginDraw: async (_id, o) => {
      if (lottery.state === 'COMPLETED' || lottery.state === 'CANCELLED')
        return null;
      lottery.state = 'DRAWING';
      order ??= o;
      return order;
    },
    occupied: async () => [],
    commit: vi.fn<HallLotteryRepository['commit']>(async (_id, winners) => {
      if (lottery.state === 'COMPLETED') throw new Error('duplicate');
      apps.forEach((a) => {
        if (a.state !== 'PENDING') return;
        const w = winners.find((w) => w.id === a.id);
        a.state = w ? 'WON' : 'LOST';
      });
      lottery.state = 'COMPLETED';
    }),
  };
  let id = 0;
  const notify = vi.fn(async () => {});
  const service = createHallLotteryService({
    repository,
    now: () => time,
    id: () => String(++id),
    random: () => 0.5,
    notify,
    broadcast: async () => {},
  });
  return {
    service,
    repository,
    lottery,
    apps,
    notify,
    setTime: (value: string) => {
      time = new Date(value);
    },
  };
}
const preference = ['2026-10-01T01:00:00.000Z'];
describe('ホール抽選ユースケース', () => {
  it('締切直前は申込可、締切瞬間は申込と取消不可', async () => {
    const f = setup();
    const a = await f.service.apply('l', 'u', 'g', preference);
    f.setTime('2026-09-25T15:00:00.000Z');
    await expect(f.service.apply('l', 'u', 'g2', preference)).rejects.toThrow(
      'LOTTERY_CLOSED',
    );
    await expect(f.service.cancelApplication(a.id, 'u')).rejects.toThrow(
      'LOTTERY_CANNOT_CANCEL',
    );
  });
  it('所属確認、同一バンドの重複防止、取消後の再申込', async () => {
    const f = setup();
    const a = await f.service.apply('l', 'u', 'g', preference);
    await expect(
      f.service.apply('l', 'other', 'g', preference),
    ).rejects.toThrow('HALL_LOTTERY_APPLICATION_CONFLICT');
    await f.service.cancelApplication(a.id, 'u');
    await expect(
      f.service.apply('l', 'other', 'g', preference),
    ).resolves.toBeDefined();
    f.repository.isMember = async () => false;
    await expect(
      f.service.apply('l', 'u', 'other', preference),
    ).rejects.toThrow('NOT_GROUP_MEMBER');
  });
  it('同時・再実行でも当選通知は1件、予約上限portへの依存なし', async () => {
    const f = setup();
    await f.service.apply('l', 'u', 'g', preference);
    f.setTime('2026-09-25T15:00:00.000Z');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await Promise.all([f.service.processDue(), f.service.processDue()]);
    await f.service.processDue();
    expect(f.lottery.state).toBe('COMPLETED');
    expect(f.apps[0].state).toBe('WON');
    expect(f.notify).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
  it('失敗中はDRAWINGを保持し、再実行で同じ順序を使用', async () => {
    const f = setup();
    await f.service.apply('l', 'u', 'g', preference);
    f.setTime('2026-09-25T15:00:00.000Z');
    const original = f.repository.commit;
    f.repository.commit = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockImplementation(original);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await f.service.processDue();
    expect(f.lottery.state).toBe('DRAWING');
    await f.service.processDue();
    expect(f.lottery.state).toBe('COMPLETED');
    expect(f.notify).toHaveBeenCalledOnce();
    log.mockRestore();
  });
  it('応募0件でも完了し、抽選後は中止不可', async () => {
    const f = setup();
    f.setTime('2026-09-25T15:00:00.000Z');
    await f.service.processDue();
    expect(f.lottery.state).toBe('COMPLETED');
    await expect(f.service.cancel('l')).rejects.toThrow(
      'LOTTERY_CANNOT_CANCEL',
    );
  });
  it('募集中止で応募も取消、以後抽選しない', async () => {
    const f = setup();
    await f.service.apply('l', 'u', 'g', preference);
    await f.service.cancel('l');
    f.setTime('2026-09-25T15:00:00.000Z');
    await f.service.processDue();
    expect(f.apps[0].state).toBe('CANCELLED');
    expect(f.repository.commit).not.toHaveBeenCalled();
  });
  it('管理者は非所属の有効なバンドで代理申込でき、無効バンドと締切後は拒否する', async () => {
    const f = setup();
    f.repository.isMember = async () => false;
    await expect(
      f.service.apply('l', 'admin', 'g', preference, true),
    ).resolves.toBeDefined();
    await expect(
      f.service.apply('l', 'member', 'other', preference),
    ).rejects.toThrow('NOT_GROUP_MEMBER');
    await expect(
      f.service.apply('l', 'admin', 'g', preference, true),
    ).rejects.toThrow('HALL_LOTTERY_APPLICATION_CONFLICT');
    f.repository.getActiveGroupBandType = async () => null;
    await expect(
      f.service.apply('l', 'admin', 'inactive', preference, true),
    ).rejects.toThrow('GROUP_NOT_FOUND');
    f.setTime('2026-09-25T15:00:00.000Z');
    await expect(
      f.service.apply('l', 'admin', 'other', preference, true),
    ).rejects.toThrow('LOTTERY_CLOSED');
  });

  it.each(['MAIN', 'FREE'] as const)(
    '対象区分 %s を一般ユーザー・管理者の双方に強制する',
    async (target) => {
      const f = setup();
      f.lottery.target_band_type = target;
      f.repository.getActiveGroupBandType = async () =>
        target === 'MAIN' ? 'FREE' : 'MAIN';
      await expect(
        f.service.apply('l', 'u', 'wrong', preference),
      ).rejects.toThrow('HALL_LOTTERY_BAND_TYPE_MISMATCH');
      await expect(
        f.service.apply('l', 'admin', 'wrong', preference, true),
      ).rejects.toThrow('HALL_LOTTERY_BAND_TYPE_MISMATCH');
      f.repository.getActiveGroupBandType = async () => target;
      await expect(
        f.service.apply('l', 'u', 'member-band', preference),
      ).resolves.toBeDefined();
      f.repository.isMember = async () => false;
      await expect(
        f.service.apply('l', 'admin', 'proxy-band', preference, true),
      ).resolves.toBeDefined();
    },
  );
  it('申込後に対象区分から外れたバンドは抽選時に落選とし、予約を生成しない', async () => {
    const f = setup();
    await f.service.apply('l', 'u', 'g', preference);
    f.repository.eligibleApplicationIds = async () => [];
    f.setTime('2026-09-25T15:00:00.000Z');
    await f.service.processDue();
    expect(f.apps[0].state).toBe('LOST');
    expect(f.repository.commit).toHaveBeenCalledWith(
      'l',
      [],
      '2026-09-25T15:00:00.000Z',
    );
    expect(f.notify).not.toHaveBeenCalled();
  });
});
