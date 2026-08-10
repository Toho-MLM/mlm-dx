export type EmailPreferences = {
  RESERVATION_RECEIVED: boolean;
  RESERVATION_CONFIRMED: boolean;
  RESERVATION_EDITED: boolean;
  RESERVATION_ADJUSTED: boolean;
  RESERVATION_DECLINED: boolean;
  RESERVATION_CANCELLED: boolean;
  RESERVATION_REVOKED: boolean;
};

export interface UserRepository {
  listSelectableGroups(userId: string, includeAll: boolean): Promise<Record<string, unknown>[]>;
  findEmailPreferences(userId: string): Promise<EmailPreferences | null>;
  updateEmailPreference(userId: string, prime: number, enabled: boolean, updatedAt: string): Promise<void>;
  updateProfile(email: string, nickname: string | null, instruments: string[], updatedAt: string): Promise<void>;
  resetAvatar(userId: string, updatedAt: string): Promise<void>;
}

