import type { ExecutiveTransition, SaveExecutiveTransitionRequest } from '@shared-schemas';
import { executiveTransitionInstant, isTransitionDue } from '../domain/schedule';

export interface ExecutiveTransitionRepository {
  get(): Promise<ExecutiveTransition | null>;
  eligibleMemberIds(): Promise<Set<string>>;
  save(schedule: ExecutiveTransition, expectedRevision: string | null, now: string): Promise<boolean>;
  cancel(expectedRevision: string, now: string): Promise<boolean>;
  applyDue(revision: string, now: string): Promise<void>;
}

export class ExecutiveTransitionError extends Error {
  constructor(public readonly code: 'INVALID_EFFECTIVE_DATE' | 'MEMBER_UNAVAILABLE' | 'TRANSITION_CONFLICT') {
    super(code);
  }
}

export function executiveTransitionService(repository: ExecutiveTransitionRepository, clock: () => Date, id: () => string) {
  return {
    get: () => repository.get(),
    async save(request: SaveExecutiveTransitionRequest): Promise<ExecutiveTransition> {
      const now = clock().toISOString();
      const effectiveAt = executiveTransitionInstant(request.effective_date);
      if (isTransitionDue(effectiveAt, now)) throw new ExecutiveTransitionError('INVALID_EFFECTIVE_DATE');
      const eligibleIds = await repository.eligibleMemberIds();
      if (request.assignments.some((entry) => !eligibleIds.has(entry.user_id))) {
        throw new ExecutiveTransitionError('MEMBER_UNAVAILABLE');
      }
      const schedule: ExecutiveTransition = {
        revision: id(), effective_date: request.effective_date, effective_at: effectiveAt,
        assignments: request.assignments, status: 'PENDING', failure_reason: null,
      };
      if (!await repository.save(schedule, request.expected_revision, now)) {
        throw new ExecutiveTransitionError('TRANSITION_CONFLICT');
      }
      return schedule;
    },
    async cancel(revision: string) {
      if (!await repository.cancel(revision, clock().toISOString())) {
        throw new ExecutiveTransitionError('TRANSITION_CONFLICT');
      }
    },
    async processDue() {
      const now = clock().toISOString();
      const schedule = await repository.get();
      if (schedule?.status === 'PENDING' && isTransitionDue(schedule.effective_at, now)) {
        await repository.applyDue(schedule.revision, now);
      }
    },
  };
}
