import { z } from 'zod';

const allowedInstruments = new Set(['VO', 'GT', 'KEY', 'DR', 'BA']);
const uuid = z.string().uuid();

export function normalizeAssignments(input: unknown): Record<string, string[]> | null {
  let raw: unknown;
  try {
    raw = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const normalized: Record<string, string[]> = {};
  for (const [instrument, value] of Object.entries(raw)) {
    if (!allowedInstruments.has(instrument)) return null;
    const ids = Array.isArray(value) ? value : [value];
    const parsed = ids.map((id) => uuid.safeParse(id));
    if (parsed.some((result) => !result.success)) return null;
    normalized[instrument] = [...new Set(parsed.map((result) => result.data as string))];
  }
  return normalized;
}

export function assignmentMemberIds(assignments: Record<string, string[]>): string[] {
  return [...new Set(Object.values(assignments).flat())];
}

