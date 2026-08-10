import type { D1Database } from '@cloudflare/workers-types';
import type { ReservationEmailRecord, ReservationEmailRepository } from '../application/email-repository';

export function createD1ReservationEmailRepository(db: D1Database): ReservationEmailRepository {
  return {
    async find(kind, reservationId) {
      const sql = kind === 'HALL' ? `
        SELECT r.id, r.user_id, r.group_id, r.state, r.start_time, r.end_time,
          COALESCE(u.nickname, u.name) AS requester_name, u.email AS requester_email,
          u.email_notification_preference_code AS requester_preference_code,
          g.name AS group_name, 'ホール' AS location_name
        FROM reservations r INNER JOIN users u ON u.id = r.user_id
        LEFT JOIN groups g ON g.id = r.group_id WHERE r.id = ?
      ` : `
        SELECT er.id, er.user_id, er.group_id, er.state, er.start_time, er.end_time,
          COALESCE(u.nickname, u.name) AS requester_name, u.email AS requester_email,
          u.email_notification_preference_code AS requester_preference_code,
          g.name AS group_name,
          json_extract(es.room_names, '$[' || (er.room_number - 1) || ']') AS location_name
        FROM external_reservations er INNER JOIN users u ON u.id = er.user_id
        LEFT JOIN groups g ON g.id = er.group_id
        INNER JOIN external_studios es ON es.id = er.external_studio_id WHERE er.id = ?
      `;
      return await db.prepare(sql).bind(reservationId).first<ReservationEmailRecord>();
    },
    async enabledGroupRecipients(groupId, prime, requesterEmail) {
      const rows = await db.prepare(`
        SELECT DISTINCT u.email, COALESCE(u.nickname, u.name) AS name
        FROM group_member_instruments gmi INNER JOIN users u ON u.id = gmi.user_id
        WHERE gmi.group_id = ? AND u.email_notification_preference_code % ? = 0 ORDER BY name ASC
      `).bind(groupId, prime).all<{ email: string; name: string }>();
      const requesterKey = requesterEmail.toLowerCase();
      const seen = new Set<string>();
      return rows.results.flatMap((member) => {
        const key = member.email.toLowerCase();
        if (key === requesterKey || seen.has(key)) return [];
        seen.add(key);
        return [{ email: member.email, name: member.name }];
      });
    },
  };
}
