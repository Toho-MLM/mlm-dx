import { z } from 'zod';

const UuidSchema = z.string().uuid();

export const INSTRUMENTS = ['VO', 'GT', 'KEY', 'DR', 'BA'] as const;

const DraftColumnSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
});

export const DraftStateSchema = z.object({
  columns: z.array(DraftColumnSchema).min(1),
  cells: z.record(UuidSchema, z.record(z.string(), z.array(UuidSchema))),
  unassignedMemberIds: z.array(UuidSchema),
  version: z.number().int().nonnegative(),
});

export type DraftState = z.infer<typeof DraftStateSchema>;
