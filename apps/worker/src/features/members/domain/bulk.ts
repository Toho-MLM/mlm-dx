export type BulkMember = { email: string };

export function duplicateEmails(members: BulkMember[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const member of members) {
    if (seen.has(member.email)) duplicates.add(member.email);
    seen.add(member.email);
  }
  return duplicates;
}

