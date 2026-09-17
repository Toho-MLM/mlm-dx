import type { Bindings } from '../index';
import { createHallLotteryService } from '../features/reservations/application/hall-lottery';
import { createD1HallLotteryRepository } from '../features/reservations/infrastructure/d1-hall-lottery-repository';
import { prepareAndSendReservationEmail } from './reservation-email';
import { broadcastReservationRealtimeEvent } from './reservation-realtime';
export function hallLotteryService(env: Bindings) {
  return createHallLotteryService({
    repository: createD1HallLotteryRepository(env.DB),
    now: () => new Date(),
    id: () => crypto.randomUUID(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
    notify: async (reservationId) => {
      await prepareAndSendReservationEmail(env, {
        kind: 'HALL',
        reservationId,
        notificationType: 'RESERVATION_CONFIRMED',
      });
    },
    broadcast: () =>
      broadcastReservationRealtimeEvent(env, 'reservations_changed'),
  });
}
