export type TimelineUpdateItem = {
  entryId: string;
  position: number | null;
  startTime?: string | null;
  endTime?: string | null;
};

export type TimelineValidationError =
  | 'DUPLICATE_POSITION'
  | 'INVALID_TIME_RANGE'
  | 'INVALID_POSITION_SEQUENCE';

export function validateTimeline(items: TimelineUpdateItem[]): TimelineValidationError | null {
  const configured = items.filter(
    (item): item is TimelineUpdateItem & { position: number } => item.position !== null,
  );
  const positions = new Set<number>();

  for (const item of configured) {
    if (positions.has(item.position)) return 'DUPLICATE_POSITION';
    positions.add(item.position);

    if (item.startTime && item.endTime && new Date(item.startTime) >= new Date(item.endTime)) {
      return 'INVALID_TIME_RANGE';
    }
  }

  const sorted = [...positions].sort((a, b) => a - b);
  if (sorted.some((position, index) => position !== index + 1)) {
    return 'INVALID_POSITION_SEQUENCE';
  }

  return null;
}

