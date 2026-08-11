import type { ReservationLimit } from '@shared-schemas'
import { ReservationLimitsClient } from './reservation-limits-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function ReservationLimitsPage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<ReservationLimit[]>>('/reservations/limits'))
  return <ReservationLimitsClient initialLimits={response?.success ? response.data ?? [] : null} />
}
