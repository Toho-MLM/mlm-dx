import type { Bindings } from '../worker/src/index';
import { apiWorker } from '../worker/src/index';
import { createUnifiedWorker } from '../worker/src/api-dispatch';

import nextWorker from 'vinext/server/fetch-handler';

export { BandDraftRoom } from '../worker/src/durable-objects/band-draft-room';
export { ReservationRoom } from '../worker/src/durable-objects/reservation-room';

export default createUnifiedWorker<Bindings>(nextWorker, apiWorker);
