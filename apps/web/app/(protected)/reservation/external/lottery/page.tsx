import type { External, ExternalLotteryApplication, ExternalReservation } from '@shared-schemas'
import { ExternalLotteryClient, type ExternalLotteryInitialData } from './external-lottery-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

type GroupOption = { id: string; name: string; is_main: boolean }

export default async function ExternalLotteryPage() {
  const [studios, applications, reservations, groups] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<External[]>>('/reservation/external/studios')),
    settleServerRequest(serverRequest<ApiResponse<ExternalLotteryApplication[]>>('/reservations/external/lottery')),
    settleServerRequest(serverRequest<ApiResponse<ExternalReservation[]>>('/reservations/external')),
    settleServerRequest(serverRequest<ApiResponse<GroupOption[]>>('/me/groups/select')),
  ])
  const initialData: ExternalLotteryInitialData = {
    studios: studios?.success ? studios.data ?? [] : null,
    applications: applications?.success ? applications.data ?? [] : null,
    reservations: reservations?.success ? reservations.data ?? [] : null,
    groups: groups?.success ? groups.data ?? [] : null,
  }

  return <ExternalLotteryClient initialData={initialData} />
}
