import type { Bindings } from '../index';
import { getJSTDateString, getJSTDayRange } from './reservation-processor';
import { broadcastReservationRealtimeEvent } from './reservation-realtime';
import { prepareAndSendReservationEmail } from './reservation-email';
import { createReservationLimitService } from '../features/reservations/application/limits';
import { createD1ReservationLimitRepository } from '../features/reservations/infrastructure/d1-limit-repository';
import { createD1GroupMembershipReader } from '../features/reservations/infrastructure/d1-membership-reader';
import { createD1ExternalLotteryRepository } from '../features/reservations/infrastructure/d1-external-lottery-repository';
import type {
  LotteryApplicationRecord as ApplicationRow,
} from '../features/reservations/application/external-lottery-repository';
import {
  EXTERNAL_LOTTERY_DURATION_STEP_MINUTES,
  EXTERNAL_LOTTERY_MAX_DURATION_MINUTES,
  EXTERNAL_LOTTERY_MIN_DURATION_MINUTES,
  calculateExternalLotteryWeights,
  getExternalLotteryWeightedOrderKey,
} from '../../../../lib/shared-schemas';
import {
  enumerateStarts,
  getApplicationRange,
  getFairShareMinutes,
  getMemberSchedulingImpact,
  hasMemberConflict,
  overlaps,
  parseRoomNames,
  subtractRoomReservations,
  type AllocatedIdentity,
  type RoomOption,
} from '../features/reservations/domain/external-lottery';

type PreparedApplication = ApplicationRow & {
  priority: number;
  fairnessScore: number;
  schedulingSlackMinutes: number;
  memberIds: string[];
  rangeStart: Date;
  rangeEnd: Date;
  requestedMinutes: number;
  weightedOrder: number;
};

function hasReservationLimitConflict(
  env: Bindings,
  userId: string,
  groupId: string | null,
  startTime: string,
  endTime: string,
  exclude?: { kind: 'HALL' | 'EXTERNAL' | 'LOTTERY'; id: string }
): Promise<boolean> {
  return createReservationLimitService(createD1ReservationLimitRepository(env.DB)).hasConflict({
    userId,
    groupId,
    startTime,
    endTime,
    exclude,
  });
}

async function getGroupMemberIds(env: Bindings, groupId: string): Promise<string[]> {
  return createD1GroupMembershipReader(env.DB).listGroupMemberIds(groupId);
}

async function getGroup(env: Bindings, groupId: string) {
  return createD1GroupMembershipReader(env.DB).getActiveGroupIdentity(groupId);
}

async function getExistingReservationAllocations(
  env: Bindings,
  rangeStart: string,
  rangeEnd: string
): Promise<AllocatedIdentity[]> {
  const reservations = await createD1ExternalLotteryRepository(env.DB)
    .listExistingReservationIdentities(rangeStart, rangeEnd);
  const memberCache = new Map<string, string[]>();
  const allocations: AllocatedIdentity[] = [];
  for (const reservation of reservations) {
    let memberIds: string[];
    if (reservation.group_id) {
      const cached = memberCache.get(reservation.group_id);
      memberIds = cached ?? await getGroupMemberIds(env, reservation.group_id);
      if (!cached) memberCache.set(reservation.group_id, memberIds);
    } else {
      memberIds = [reservation.user_id];
    }
    allocations.push({
      memberIds: new Set(memberIds),
      start: new Date(reservation.start_time),
      end: new Date(reservation.end_time),
    });
  }
  return allocations;
}

export async function getExternalLotteryFairnessScore(
  env: Bindings,
  userId: string,
  groupId: string | null,
  rangeEnd: Date
): Promise<number> {
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 30);
  return createD1ExternalLotteryRepository(env.DB).getFairnessUsageMinutes(
    userId,
    groupId,
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  );
}

async function markLost(env: Bindings, applicationId: string, score: number | null) {
  await createD1ExternalLotteryRepository(env.DB).markLost(applicationId, score, new Date().toISOString());
}

export async function processExternalLotteryForNextDay(env: Bindings): Promise<number> {
  const nextDay = new Date();
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const targetDate = getJSTDateString(nextDay);
  const dayRange = getJSTDayRange(targetDate);
  const lotteryRepository = createD1ExternalLotteryRepository(env.DB);
  const studios = await lotteryRepository.listStudios(
    dayRange.startUTC.toISOString(),
    dayRange.endUTC.toISOString()
  );

  const allocationRangeEnd = studios.reduce(
    (latest, studio) => Math.max(latest, new Date(studio.end_datetime).getTime()),
    dayRange.endUTC.getTime()
  );
  const allocated = await getExistingReservationAllocations(
    env,
    dayRange.startUTC.toISOString(),
    new Date(allocationRangeEnd).toISOString()
  );

  let processed = 0;
  for (const studio of studios) {
    const roomNames = parseRoomNames(studio.room_names);
    const applications = await lotteryRepository.listPendingApplications(
      studio,
      dayRange.startUTC.toISOString(),
      dayRange.endUTC.toISOString()
    );

    const prepared: PreparedApplication[] = [];
    for (const application of applications) {
      const identity = application.group_id ? await getGroup(env, application.group_id) : { isMain: false, memberIds: [application.user_id] };
      const range = getApplicationRange(application, studio, dayRange.startUTC, dayRange.endUTC);
      if (
        !identity ||
        !range ||
        range.requestedMinutes < EXTERNAL_LOTTERY_MIN_DURATION_MINUTES ||
        range.requestedMinutes > EXTERNAL_LOTTERY_MAX_DURATION_MINUTES ||
        range.requestedMinutes % EXTERNAL_LOTTERY_DURATION_STEP_MINUTES !== 0
      ) {
        await markLost(env, application.id, null);
        processed += 1;
        continue;
      }
      prepared.push({
        ...application,
        priority: application.group_id ? (identity.isMain ? 0 : 1) : 2,
        fairnessScore: await getExternalLotteryFairnessScore(env, application.user_id, application.group_id, dayRange.startUTC),
        schedulingSlackMinutes: Math.round(
          (range.rangeEnd.getTime() - range.rangeStart.getTime()) / 60000
        ) - range.requestedMinutes,
        memberIds: identity.memberIds,
        weightedOrder: 0,
        ...range,
      });
    }

    for (const priority of [0, 1, 2]) {
      const cohort = prepared.filter((application) => application.priority === priority);
      const weights = calculateExternalLotteryWeights(cohort);
      for (const application of cohort) {
        const random = new Uint32Array(1);
        crypto.getRandomValues(random);
        const randomUnit = (random[0] + 1) / (0x1_0000_0000 + 1);
        application.weightedOrder = getExternalLotteryWeightedOrderKey(
          weights.get(application.id) ?? 1,
          randomUnit
        );
      }
    }
    prepared.sort((a, b) => a.priority - b.priority || a.weightedOrder - b.weightedOrder);
    for (let index = 0; index < prepared.length; index += 1) {
      const application = prepared[index];
      const alreadyCreated = await lotteryRepository.findCreatedReservation(application.id);
      if (alreadyCreated) {
        const recovered = await lotteryRepository.recoverWon({
          applicationId: application.id,
          score: application.fairnessScore,
          reservation: alreadyCreated,
          updatedAt: new Date().toISOString(),
        });
        if (!recovered) continue;
        allocated.push({
          memberIds: new Set(application.memberIds),
          start: new Date(alreadyCreated.start_time),
          end: new Date(alreadyCreated.end_time),
        });
        await prepareAndSendReservationEmail(env, {
          kind: 'EXTERNAL', reservationId: alreadyCreated.id, notificationType: 'RESERVATION_CONFIRMED',
        });
        processed += 1;
        continue;
      }

      const reservations = await lotteryRepository.listConfirmedRoomReservations(
        studio.id,
        application.rangeStart.toISOString(),
        application.rangeEnd.toISOString()
      );
      const roomOptions: RoomOption[] = roomNames.map((_, roomIndex) => {
        const roomNumber = roomIndex + 1;
        const intervals = subtractRoomReservations(
          application.rangeStart,
          application.rangeEnd,
          reservations.filter((reservation) => reservation.room_number === roomNumber)
        );
        const longestMinutes = intervals.reduce((max, interval) => Math.max(max, Math.floor((interval.end.getTime() - interval.start.getTime()) / 60000)), 0);
        return { roomNumber, intervals, longestMinutes };
      });
      const fairShareMinutes = getFairShareMinutes(application, prepared.slice(index), roomOptions);
      const hasFullRoom = roomOptions.some((room) => room.longestMinutes >= fairShareMinutes);
      const rankedRooms = roomOptions
        .filter((room) => hasFullRoom
          ? room.longestMinutes >= fairShareMinutes
          : room.longestMinutes >= EXTERNAL_LOTTERY_MIN_DURATION_MINUTES)
        .sort((a, b) => b.longestMinutes - a.longestMinutes || a.roomNumber - b.roomNumber);

      let assignment: { roomNumber: number; start: Date; end: Date } | null = null;
      const remainingApplications = prepared.slice(index + 1);
      const candidates = rankedRooms.flatMap((room) => {
        const duration = hasFullRoom
          ? fairShareMinutes
          : Math.floor(room.longestMinutes / EXTERNAL_LOTTERY_DURATION_STEP_MINUTES)
            * EXTERNAL_LOTTERY_DURATION_STEP_MINUTES;
        if (duration < EXTERNAL_LOTTERY_MIN_DURATION_MINUTES) return [];
        return room.intervals.flatMap((interval) => enumerateStarts(interval, duration, dayRange.endUTC)).map((start) => {
          const end = new Date(start.getTime() + duration * 60000);
          const memberImpact = getMemberSchedulingImpact(application, start, end, remainingApplications);
          const contention = remainingApplications.filter((remaining) => overlaps(start, end, remaining.rangeStart, remaining.rangeEnd)).length;
          return { roomNumber: room.roomNumber, start, end, contention, ...memberImpact };
        });
      }).filter((candidate) => !hasMemberConflict(application.memberIds, candidate.start, candidate.end, allocated))
        .sort((a, b) => (
          a.madeUnschedulable - b.madeUnschedulable
          || a.lostOptions - b.lostOptions
          || a.contention - b.contention
          || a.start.getTime() - b.start.getTime()
          || a.roomNumber - b.roomNumber
        ));
      for (const candidate of candidates) {
        const exceedsLimit = await hasReservationLimitConflict(
          env,
          application.user_id,
          application.group_id,
          candidate.start.toISOString(),
          candidate.end.toISOString(),
          { kind: 'LOTTERY', id: application.id }
        );
        if (!exceedsLimit) {
          assignment = { roomNumber: candidate.roomNumber, start: candidate.start, end: candidate.end };
          break;
        }
      }

      if (!assignment) {
        await markLost(env, application.id, application.fairnessScore);
        processed += 1;
        continue;
      }

      const now = new Date().toISOString();
      const inserted = await lotteryRepository.allocateWon({
        application,
        studioId: studio.id,
        roomNumber: assignment.roomNumber,
        startTime: assignment.start.toISOString(),
        endTime: assignment.end.toISOString(),
        score: application.fairnessScore,
        updatedAt: now,
      });
      if (!inserted) continue;
      await prepareAndSendReservationEmail(env, {
        kind: 'EXTERNAL', reservationId: application.id, notificationType: 'RESERVATION_CONFIRMED',
      });
      allocated.push({ memberIds: new Set(application.memberIds), start: assignment.start, end: assignment.end });
      processed += 1;
    }
  }

  if (processed > 0) await broadcastReservationRealtimeEvent(env, 'reservations_changed');
  return processed;
}
