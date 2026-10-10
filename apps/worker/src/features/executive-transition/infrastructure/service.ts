import type { D1Database } from '@cloudflare/workers-types';
import { executiveTransitionService } from '../application/service';
import { createD1ExecutiveTransitionRepository } from './d1-repository';

export function createExecutiveTransitionService(db: D1Database) {
  return executiveTransitionService(createD1ExecutiveTransitionRepository(db), () => new Date(), () => crypto.randomUUID());
}
