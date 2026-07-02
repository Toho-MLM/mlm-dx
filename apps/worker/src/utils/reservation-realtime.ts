import type { Bindings } from '../index';

export type ReservationRealtimeEvent = 'reservations_changed' | 'reservation_limits_changed';

export async function broadcastReservationRealtimeEvent(
  env: Bindings,
  type: ReservationRealtimeEvent
): Promise<void> {
  try {
    const id = env.RESERVATION_ROOM.idFromName('global');
    const room = env.RESERVATION_ROOM.get(id);
    const typedRoom = room as unknown as {
      fetch(request: globalThis.Request): Promise<globalThis.Response>;
    };

    await typedRoom.fetch(new Request('https://reservation-room.local/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type }),
    }));
  } catch (error) {
    console.error('Failed to broadcast reservation realtime event:', error);
  }
}
