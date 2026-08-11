import type { External, ExternalReservation } from '@shared-schemas'
import { ExternalReservationClient, type ExternalReservationInitialData } from './external-reservation-client'
import { getServerAdminMode, requireAuth, serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function ExternalReservationPage() {
  const user = await requireAuth()
  const adminMode = await getServerAdminMode(user)
  const [externals, reservations] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<External[]>>('/reservation/external/studios')),
    settleServerRequest(serverRequest<ApiResponse<ExternalReservation[]>>(`/reservations/external${adminMode ? '?admin=true' : ''}`)),
  ])
  const initialData: ExternalReservationInitialData = {
    externals: externals?.success ? externals.data ?? [] : null,
    reservations: reservations?.success ? reservations.data ?? [] : null,
  }

  return <ExternalReservationClient initialData={initialData} initialAdminMode={adminMode} />
}
