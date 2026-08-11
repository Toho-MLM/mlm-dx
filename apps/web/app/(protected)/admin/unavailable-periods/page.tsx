import type { UnavailablePeriod } from '@shared-schemas'
import { UnavailablePeriodsClient } from './unavailable-periods-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function UnavailablePeriodsPage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<UnavailablePeriod[]>>('/reservations/unavailable'))
  return <UnavailablePeriodsClient initialPeriods={response?.success ? response.data ?? [] : null} />
}
