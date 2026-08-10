export type MemberWrite = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  grade: number;
  instruments: string[];
  role: string;
};

export interface MemberRepository {
  list(): Promise<Record<string, unknown>[]>;
  emailExists(email: string): Promise<boolean>;
  existingEmails(emails: string[]): Promise<Set<string>>;
  create(member: MemberWrite, now: string): Promise<void>;
  update(id: string, values: Omit<MemberWrite, 'id' | 'name' | 'email'>, now: string): Promise<void>;
  moveUpGrades(now: string): Promise<{ deletedCount: number; movedUpCount: number }>;
  exists(id: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  listForSelect(currentUserId: string): Promise<Record<string, unknown>[]>;
}

