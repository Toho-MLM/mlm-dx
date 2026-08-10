export function validateEventDates(entryDeadline: string, setlistDeadline: string, eventDate: string): boolean {
  return new Date(entryDeadline) <= new Date(setlistDeadline)
    && new Date(setlistDeadline) < new Date(eventDate);
}
