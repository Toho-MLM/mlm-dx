import type { Event } from '@shared-schemas'
import { TimelineClient } from './timeline-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function TimelinePage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<Event[]>>('/events'))
  return <TimelineClient initialEvents={response?.success ? response.data ?? [] : null} />
}
