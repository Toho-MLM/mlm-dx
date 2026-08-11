import type { Event } from '@shared-schemas'
import { SetlistClient } from './setlist-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function SetlistPage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<Event[]>>('/events'))
  return <SetlistClient initialEvents={response?.success ? response.data ?? [] : null} />
}
