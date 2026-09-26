export type ScheduledTask = {
  name: string;
  run(): Promise<unknown>;
};

export async function runScheduledTasks(
  tasks: ScheduledTask[],
  reportError: (name: string, error: unknown) => void,
): Promise<void> {
  let failures = 0;
  for (const task of tasks) {
    try {
      await task.run();
    } catch (error) {
      failures += 1;
      reportError(task.name, error);
    }
  }
  if (failures > 0) {
    throw new Error(`${failures} scheduled task(s) failed`);
  }
}
