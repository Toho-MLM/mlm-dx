export type UserRow = {
  id: string; name: string; nickname: string | null; email: string; avatar: string | null;
  instruments: string; grade: number; role: string; created_at: string; updated_at: string;
};
export type PasskeyRow = {
  id: string; user_id: string; credential_id: string; public_key: string; counter: number;
  device_type: string | null; backed_up: number | null; transports: string | null;
  attestation_format: string | null; created_at: string; updated_at: string;
};
export type PasskeyChallengeRow = {
  id: string; user_id: string | null; email: string | null; challenge: string;
  type: string; expires_at: string; created_at: string;
};
export type PasskeyWrite = Omit<PasskeyRow, 'id' | 'created_at' | 'updated_at'>;

export interface AuthRepository {
  findUserById(id: string): Promise<UserRow | null>;
  findUserByEmail(email: string): Promise<UserRow | null>;
  updateGoogleProfile(email: string, values: { name?: string; avatar?: string | null }, now: string): Promise<void>;
  listPasskeys(userId: string): Promise<PasskeyRow[]>;
  findPasskeyByCredential(credentialId: string): Promise<PasskeyRow | null>;
  findChallenge(id: string): Promise<PasskeyChallengeRow | null>;
  deleteChallenge(id: string): Promise<void>;
  deleteExpiredChallenges(now: string): Promise<void>;
  deleteChallenges(userId: string, type: string): Promise<void>;
  createChallenge(challenge: PasskeyChallengeRow): Promise<void>;
  upsertPasskey(passkey: PasskeyWrite, now: string, createId: () => string): Promise<void>;
  updatePasskeyCounter(id: string, counter: number, now: string): Promise<void>;
  deletePasskey(id: string, userId: string): Promise<boolean>;
  userCount(): Promise<number>;
  emailExists(email: string): Promise<boolean>;
  createFirstUser(input: { id: string; name: string; email: string; grade: number }, now: string): Promise<boolean>;
}

