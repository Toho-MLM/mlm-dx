import type { Entry, Event } from '@shared-schemas'
import { EventClient } from './event-client'
import { requireAuth, serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'
import { isAdmin } from '@shared-schemas'

type GroupOption = { id: string; name: string; main_index: number | null }

export default async function EventPage() {
  const user = await requireAuth()
  const [events, groups, entries] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<Event[]>>('/events')),
    settleServerRequest(serverRequest<ApiResponse<GroupOption[]>>(`/me/groups/select${isAdmin(user.role) ? '?admin=true' : ''}`)),
    settleServerRequest(serverRequest<ApiResponse<Entry[]>>('/entries')),
  ])

  return (
    <EventClient
      initialEvents={events?.success ? events.data ?? [] : null}
      initialGroups={groups?.success ? groups.data ?? [] : null}
      initialEntries={entries?.success ? entries.data ?? [] : null}
    />
  )
}
