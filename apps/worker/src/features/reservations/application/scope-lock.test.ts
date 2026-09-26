import { describe, expect, it } from 'vitest';
import { withReservationScopeLock, type ReservationScopeLockRepository } from './scope-lock';

describe('reservation scope lock', () => {
  it('同じ名義の申込を順に実行し、先行申込の結果を後続が見られる', async () => {
    let active = false;
    let finishFirst!: () => void;
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve; });
    const waiters: Array<() => void> = [];
    const repository: ReservationScopeLockRepository = {
      tryAcquire: async () => {
        if (active) return false;
        active = true;
        return true;
      },
      release: async () => { active = false; },
    };
    const deps = {
      repository,
      now: () => new Date('2026-09-26T00:00:00.000Z'),
      id: () => crypto.randomUUID(),
      delay: () => new Promise<void>((resolve) => { waiters.push(resolve); }),
    };
    const order: string[] = [];
    const first = withReservationScopeLock(deps, 'user', null, async () => {
      order.push('first start');
      firstStarted();
      await firstGate;
      order.push('first end');
    });
    await started;
    const second = withReservationScopeLock(deps, 'user', null, async () => {
      order.push('second start');
    });
    await Promise.resolve();
    expect(order).toEqual(['first start']);
    finishFirst();
    await first;
    for (const wake of waiters) wake();
    await second;
    expect(order).toEqual(['first start', 'first end', 'second start']);
  });
});
