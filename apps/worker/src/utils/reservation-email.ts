import type { EmailNotificationType } from '../../../../lib/shared-schemas';
import type { Bindings } from '../index';
import { getEmailNotificationPrime } from './email-notification-preferences';
import {
  buildReservationEmailContent,
  type ReservationEmailKind,
  type ReservationEmailStatus,
} from './reservation-email-template';
import { sendMail } from './smtp';
import type { ReservationEmailRecord, EmailRecipient } from '../features/reservations/application/email-repository';
import { createD1ReservationEmailRepository } from '../features/reservations/infrastructure/d1-email-repository';

export type { ReservationEmailKind } from './reservation-email-template';

export type PreparedReservationEmail = {
  reservationId: string;
  notificationType: EmailNotificationType;
  to: EmailRecipient;
  cc: EmailRecipient[];
  subject: string;
  text: string;
  html: string;
};

export type PrepareReservationEmailOptions = {
  kind: ReservationEmailKind;
  reservationId: string;
  notificationType: EmailNotificationType;
  reservationStatusOverride?: ReservationEmailStatus;
  requestedStartTime?: string;
  requestedEndTime?: string;
};

function reservationUrl(env: Bindings, kind: ReservationEmailKind): string {
  const baseUrl = env.FRONTEND_URL.replace(/\/$/, '');
  return kind === 'HALL' ? `${baseUrl}/reservation` : `${baseUrl}/reservation/external`;
}

async function fetchReservationRow(
  env: Bindings,
  kind: ReservationEmailKind,
  reservationId: string
): Promise<ReservationEmailRecord | null> {
  return createD1ReservationEmailRepository(env.DB).find(kind, reservationId);
}

async function fetchEnabledGroupRecipients(
  env: Bindings,
  groupId: string,
  prime: number,
  requesterEmail: string
): Promise<EmailRecipient[]> {
  return createD1ReservationEmailRepository(env.DB).enabledGroupRecipients(groupId, prime, requesterEmail);
}

export async function prepareReservationEmail(
  env: Bindings,
  options: PrepareReservationEmailOptions
): Promise<PreparedReservationEmail | null> {
  const row = await fetchReservationRow(env, options.kind, options.reservationId);
  if (!row) return null;

  const prime = getEmailNotificationPrime(options.notificationType);
  const requesterEnabled = Number(row.requester_preference_code) % prime === 0;
  const to = { email: row.requester_email, name: row.requester_name };
  let cc: EmailRecipient[] = [];

  if (row.group_id) {
    cc = await fetchEnabledGroupRecipients(env, row.group_id, prime, row.requester_email);
    if (!requesterEnabled && cc.length === 0) return null;
  } else if (!requesterEnabled) {
    return null;
  }

  return {
    reservationId: row.id,
    notificationType: options.notificationType,
    to,
    cc,
    ...buildReservationEmailContent({
      notificationType: options.notificationType,
      kind: options.kind,
      reservationStatus: options.reservationStatusOverride ?? row.state,
      reservationName: row.group_name || row.requester_name,
      locationName: row.location_name || '未設定',
      requesterName: row.requester_name,
      startTime: row.start_time,
      endTime: row.end_time,
      previousStartTime: options.requestedStartTime,
      previousEndTime: options.requestedEndTime,
      reservationUrl: reservationUrl(env, options.kind),
    }),
  };
}

export async function sendPreparedReservationEmail(
  env: Bindings,
  prepared: PreparedReservationEmail | null
): Promise<void> {
  if (!prepared) return;

  try {
    const result = await sendMail(env, prepared);
    if (result === 'skipped') {
      console.warn('Reservation email skipped because SMTP is not configured', {
        reservationId: prepared.reservationId,
        notificationType: prepared.notificationType,
      });
    }
  } catch (error) {
    console.error('Reservation email delivery failed', {
      reservationId: prepared.reservationId,
      notificationType: prepared.notificationType,
      error: error instanceof Error ? error.message : 'UNKNOWN_SMTP_ERROR',
    });
  }
}

export async function prepareAndSendReservationEmail(
  env: Bindings,
  options: PrepareReservationEmailOptions
): Promise<void> {
  try {
    const prepared = await prepareReservationEmail(env, options);
    await sendPreparedReservationEmail(env, prepared);
  } catch (error) {
    console.error('Reservation email preparation failed', {
      reservationId: options.reservationId,
      notificationType: options.notificationType,
      error: error instanceof Error ? error.message : 'UNKNOWN_EMAIL_ERROR',
    });
  }
}
