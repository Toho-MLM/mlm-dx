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
  findRole(id: string): Promise<string | null>;
  update(id: string, values: Omit<MemberWrite, 'id' | 'name' | 'email'>, now: string, canChangeAdmRole: boolean): Promise<boolean>;
  moveUpGrades(now: string, canDeleteAdm: boolean): Promise<{ deletedCount: number; movedUpCount: number } | null>;
  exists(id: string): Promise<boolean>;
  delete(id: string, canDeleteAdm: boolean): Promise<boolean>;
  listForSelect(currentUserId: string): Promise<Record<string, unknown>[]>;
}
