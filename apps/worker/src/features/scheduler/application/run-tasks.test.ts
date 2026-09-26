import { describe, expect, it, vi } from 'vitest';
import { runScheduledTasks } from './run-tasks';

describe('runScheduledTasks', () => {
  it('失敗した処理を記録し、後続の処理も実行してから失敗を通知する', async () => {
    const second = vi.fn().mockResolvedValue(undefined);
    const reportError = vi.fn();
    const failure = new Error('D1 unavailable');

    await expect(runScheduledTasks([
      { name: 'first', run: async () => { throw failure; } },
      { name: 'second', run: second },
    ], reportError)).rejects.toThrow('1 scheduled task(s) failed');

    expect(second).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith('first', failure);
  });
});
