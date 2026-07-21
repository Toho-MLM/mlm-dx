import { UuidSchema } from '@shared-schemas';

export function parseUuid(value: unknown): string | null {
  const result = UuidSchema.safeParse(value);
  return result.success ? result.data : null;
}
