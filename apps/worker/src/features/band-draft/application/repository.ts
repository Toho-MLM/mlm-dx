export type DraftRow = { id: string; share_token: string; state_json: string; created_by: string };
export type DraftGroup = { id: string; name: string; assignments: Array<{ instrument: string; memberId: string }> };

export interface BandDraftRepository {
  findByToken(token: string): Promise<DraftRow | null>;
  findLatest(): Promise<DraftRow | null>;
  deleteExcept(id: string): Promise<void>;
  listMembers(): Promise<Array<{ id: string; name: string; instruments: string[] }>>;
  create(draft: DraftRow, now: string): Promise<void>;
  membersExist(ids: string[]): Promise<boolean>;
  finalize(draft: DraftRow, groups: DraftGroup[], now: string, createId: () => string): Promise<boolean>;
  delete(id: string): Promise<void>;
  updateState(id: string, currentJson: string, nextJson: string, now: string): Promise<boolean>;
  deleteOlderThan(cutoff: string): Promise<void>;
}

