export type ArchiveRecord = { id: string; title: string; youtube_url: string; year: number };

export interface ArchiveRepository {
  list(): Promise<ArchiveRecord[]>;
  exists(id: string): Promise<boolean>;
  create(input: ArchiveRecord, createdAt: string): Promise<void>;
  update(input: ArchiveRecord, updatedAt: string): Promise<void>;
  delete(id: string): Promise<void>;
}
