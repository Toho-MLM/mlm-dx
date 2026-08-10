import type { ReservationEmailStatus } from '../domain/email';

export type ReservationEmailRecord = {
  id: string; user_id: string; group_id: string | null; state: ReservationEmailStatus;
  start_time: string; end_time: string; requester_name: string; requester_email: string;
  requester_preference_code: number; group_name: string | null; location_name: string | null;
};
export type EmailRecipient = { email: string; name?: string };

export interface ReservationEmailRepository {
  find(kind: 'HALL' | 'EXTERNAL', reservationId: string): Promise<ReservationEmailRecord | null>;
  enabledGroupRecipients(groupId: string, prime: number, requesterEmail: string): Promise<EmailRecipient[]>;
}
