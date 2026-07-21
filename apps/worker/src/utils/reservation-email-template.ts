import type { EmailNotificationType } from '../../../../lib/shared-schemas';
import reservationEmailHtmlTemplate from '../templates/reservation-email.html';

export type ReservationEmailKind = 'HALL' | 'EXTERNAL';
export type ReservationEmailStatus = 'PENDING' | 'WITHDRAWN' | 'DECLINED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export type ReservationEmailTemplateInput = {
  notificationType: EmailNotificationType;
  kind: ReservationEmailKind;
  reservationStatus: ReservationEmailStatus;
  reservationName: string;
  locationName: string;
  requesterName: string;
  startTime: string;
  endTime: string;
  previousStartTime?: string;
  previousEndTime?: string;
  reservationUrl: string;
};

export type ReservationEmailContent = {
  subject: string;
  text: string;
  html: string;
};

const notificationTitles: Record<EmailNotificationType, string> = {
  RESERVATION_RECEIVED: '予約を受け付けました',
  RESERVATION_CONFIRMED: '予約が確定しました',
  RESERVATION_EDITED: '予約が変更されました',
  RESERVATION_ADJUSTED: '予約時間が変更されました',
  RESERVATION_DECLINED: '予約は自動的に却下されました',
  RESERVATION_CANCELLED: '予約が取り消されました',
  RESERVATION_REVOKED: '予約が無効化されました',
};

const reservationStatusLabels: Record<ReservationEmailStatus, string> = {
  PENDING: '保留中',
  WITHDRAWN: '取り下げ',
  DECLINED: '却下',
  CONFIRMED: '確定',
  CANCELLED: 'キャンセル',
  COMPLETED: '完了',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatJstDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

type HtmlPlaceholder =
  | 'NOTIFICATION_TITLE'
  | 'PREHEADER'
  | 'LOCATION'
  | 'RESERVATION_NAME'
  | 'REQUESTER_NAME'
  | 'RESERVATION_STATUS'
  | 'DETAIL_LABEL'
  | 'DETAIL_CONTENT'
  | 'RESERVATION_URL';

function renderHtmlTemplate(replacements: Record<HtmlPlaceholder, string>): string {
  return reservationEmailHtmlTemplate.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key: string) => {
    if (!Object.hasOwn(replacements, key)) {
      throw new Error(`Unknown reservation email template placeholder: ${placeholder}`);
    }

    return replacements[key as HtmlPlaceholder];
  });
}

export function buildReservationEmailContent(input: ReservationEmailTemplateInput): ReservationEmailContent {
  const notificationTitle = notificationTitles[input.notificationType];
  const reservationLocation = input.kind === 'HALL' ? 'ホール' : input.locationName;
  const startTime = formatJstDateTime(input.startTime);
  const endTime = formatJstDateTime(input.endTime);
  const previousStart = input.previousStartTime ? formatJstDateTime(input.previousStartTime) : null;
  const previousEnd = input.previousEndTime ? formatJstDateTime(input.previousEndTime) : null;
  const previousTime = previousStart && previousEnd ? `${previousStart} 〜 ${previousEnd}` : '';
  const timeChanged = (
    input.notificationType === 'RESERVATION_EDITED'
    || input.notificationType === 'RESERVATION_ADJUSTED'
  ) && previousTime !== '';
  const reservationTime = `${startTime} 〜 ${endTime}`;
  const reservationStatus = reservationStatusLabels[input.reservationStatus];
  const detailLabel = timeChanged ? '変更前 → 変更後' : '予約時間';
  const detailContent = timeChanged ? `${previousTime} → ${reservationTime}` : reservationTime;
  const subject = `【MLM-DX】${notificationTitle}（${input.reservationName}）`;

  const detailLines = [
    `場所: ${reservationLocation}`,
    `予約名義: ${input.reservationName}`,
    `申請者: ${input.requesterName}`,
    `ステータス: ${reservationStatus}`,
    `${detailLabel}: ${detailContent}`,
  ];

  const text = [
    notificationTitle,
    '',
    ...detailLines,
    '',
    `予約を確認する: ${input.reservationUrl}`,
    '',
    'このメールはMLM-DXから自動送信されています。',
  ].join('\n');
  const html = renderHtmlTemplate({
    NOTIFICATION_TITLE: escapeHtml(notificationTitle),
    PREHEADER: escapeHtml(notificationTitle),
    LOCATION: escapeHtml(reservationLocation),
    RESERVATION_NAME: escapeHtml(input.reservationName),
    REQUESTER_NAME: escapeHtml(input.requesterName),
    RESERVATION_STATUS: escapeHtml(reservationStatus),
    DETAIL_LABEL: escapeHtml(detailLabel),
    DETAIL_CONTENT: escapeHtml(detailContent),
    RESERVATION_URL: escapeHtml(input.reservationUrl),
  });

  return { subject, text, html };
}
