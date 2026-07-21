import type { EmailNotificationType } from '../../../../lib/shared-schemas';

export const EMAIL_NOTIFICATION_PRIMES: Record<EmailNotificationType, number> = {
  RESERVATION_RECEIVED: 2,
  RESERVATION_CONFIRMED: 3,
  RESERVATION_EDITED: 5,
  RESERVATION_ADJUSTED: 7,
  RESERVATION_DECLINED: 11,
  RESERVATION_CANCELLED: 13,
  RESERVATION_REVOKED: 17,
};

export function getEmailNotificationPrime(type: EmailNotificationType): number {
  return EMAIL_NOTIFICATION_PRIMES[type];
}
