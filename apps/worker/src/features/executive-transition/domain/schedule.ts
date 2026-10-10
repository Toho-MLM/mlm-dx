export function executiveTransitionInstant(date: string): string {
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}

export function isTransitionDue(effectiveAt: string, now: string): boolean {
  return effectiveAt <= now;
}
