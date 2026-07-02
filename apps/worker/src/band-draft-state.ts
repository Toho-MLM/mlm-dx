import { z } from 'zod';

export const INSTRUMENTS = ['VO', 'GT', 'KEY', 'DR', 'BA'] as const;

const DraftColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const DraftStateSchema = z.object({
  columns: z.array(DraftColumnSchema).min(1),
  cells: z.record(z.string(), z.record(z.string(), z.array(z.string()))),
  unassignedMemberIds: z.array(z.string()),
  version: z.number().int().nonnegative(),
});

export type DraftState = z.infer<typeof DraftStateSchema>;
