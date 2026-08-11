import type { Event, Reservation, ReservationLimit, UnavailablePeriod } from '@shared-schemas'
import { ReservationClient, type ReservationInitialData } from './reservation-client'
import { getServerAdminMode, requireAuth, serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function ReservationPage() {
  const user = await requireAuth()
  const adminMode = await getServerAdminMode(user)
  const [reservations, events, periods, limits] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<Reservation[]>>(`/reservations${adminMode ? '?admin=true' : ''}`)),
    settleServerRequest(serverRequest<ApiResponse<Event[]>>('/events')),
    settleServerRequest(serverRequest<ApiResponse<UnavailablePeriod[]>>('/reservations/unavailable')),
    settleServerRequest(serverRequest<ApiResponse<ReservationLimit[]>>('/reservations/limits')),
  ])
  const initialData: ReservationInitialData = {
    reservations: reservations?.success ? reservations.data ?? [] : null,
    events: events?.success ? events.data ?? [] : null,
    unavailablePeriods: periods?.success ? periods.data ?? [] : null,
    reservationLimits: limits?.success ? limits.data ?? [] : null,
  }

  return <ReservationClient initialData={initialData} initialAdminMode={adminMode} />
}
