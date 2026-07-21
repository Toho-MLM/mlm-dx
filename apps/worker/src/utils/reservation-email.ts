import type { EmailNotificationType } from '../../../../lib/shared-schemas';
import type { Bindings } from '../index';
import { getEmailNotificationPrime } from './email-notification-preferences';
import {
  buildReservationEmailContent,
  type ReservationEmailKind,
  type ReservationEmailStatus,
} from './reservation-email-template';
import { sendMail } from './smtp';

export type { ReservationEmailKind } from './reservation-email-template';

type ReservationEmailRow = {
  id: string;
  user_id: string;
  group_id: string | null;
  state: ReservationEmailStatus;
  start_time: string;
  end_time: string;
  requester_name: string;
  requester_email: string;
  requester_preference_code: number;
  group_name: string | null;
  location_name: string | null;
};

type Recipient = {
  email: string;
  name?: string;
};

export type PreparedReservationEmail = {
  reservationId: string;
  notificationType: EmailNotificationType;
  to: Recipient;
  cc: Recipient[];
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
): Promise<ReservationEmailRow | null> {
  if (kind === 'HALL') {
    return env.DB.prepare(`
      SELECT r.id, r.user_id, r.group_id, r.state, r.start_time, r.end_time,
             COALESCE(u.nickname, u.name) AS requester_name,
             u.email AS requester_email,
             u.email_notification_preference_code AS requester_preference_code,
             g.name AS group_name,
             'ホール' AS location_name
      FROM reservations r
      INNER JOIN users u ON u.id = r.user_id
      LEFT JOIN groups g ON g.id = r.group_id
      WHERE r.id = ?
    `).bind(reservationId).first<ReservationEmailRow>();
  }

  return env.DB.prepare(`
    SELECT er.id, er.user_id, er.group_id, er.state, er.start_time, er.end_time,
           COALESCE(u.nickname, u.name) AS requester_name,
           u.email AS requester_email,
           u.email_notification_preference_code AS requester_preference_code,
           g.name AS group_name,
           es.name AS location_name
    FROM external_reservations er
    INNER JOIN users u ON u.id = er.user_id
    INNER JOIN groups g ON g.id = er.group_id
    INNER JOIN external_studios es ON es.id = er.external_studio_id
    WHERE er.id = ?
  `).bind(reservationId).first<ReservationEmailRow>();
}

async function fetchEnabledGroupRecipients(
  env: Bindings,
  groupId: string,
  prime: number,
  requesterEmail: string
): Promise<Recipient[]> {
  const members = await env.DB.prepare(`
    SELECT DISTINCT u.email, COALESCE(u.nickname, u.name) AS name
    FROM group_member_instruments gmi
    INNER JOIN users u ON u.id = gmi.user_id
    WHERE gmi.group_id = ?
      AND u.email_notification_preference_code % ? = 0
    ORDER BY name ASC
  `).bind(groupId, prime).all<{ email: string; name: string }>();

  const requesterKey = requesterEmail.toLowerCase();
  const seen = new Set<string>();
  return members.results.flatMap((member) => {
    const key = member.email.toLowerCase();
    if (key === requesterKey || seen.has(key)) return [];
    seen.add(key);
    return [{ email: member.email, name: member.name }];
  });
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
  let cc: Recipient[] = [];

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
