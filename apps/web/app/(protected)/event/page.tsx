import type { Entry, Event } from '@shared-schemas'
import { EventClient } from './event-client'
import { getServerAdminMode, requireAuth, serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

type GroupOption = { id: string; name: string; main_index: number | null }

export default async function EventPage() {
  const user = await requireAuth()
  const adminMode = await getServerAdminMode(user)
  const [events, groups, entries] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<Event[]>>('/events')),
    settleServerRequest(serverRequest<ApiResponse<GroupOption[]>>(`/me/groups/select${adminMode ? '?admin=true' : ''}`)),
    settleServerRequest(serverRequest<ApiResponse<Entry[]>>('/entries')),
  ])

  return (
    <EventClient
      initialAdminMode={adminMode}
      initialEvents={events?.success ? events.data ?? [] : null}
      initialGroups={groups?.success ? groups.data ?? [] : null}
      initialEntries={entries?.success ? entries.data ?? [] : null}
    />
  )
}
