'use client'

import { createContext, useContext, type ReactNode } from 'react'

type GroupOption = { id: string; name: string; is_main: boolean }
type UserEntry = { id: string; event_id: string; group_id: string; note?: string | null; created_at: string }

export type EventContextValue = {
  groupOptions?: GroupOption[]
  userEntries?: UserEntry[]
  loadingEntries?: boolean
  onEntriesChanged?: () => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

const EventContext = createContext<EventContextValue | null>(null)

export function useEventContext() {
  return useContext(EventContext)
}

export function EventProvider({ value, children }: { value: EventContextValue; children: ReactNode }) {
  return (
    <EventContext.Provider value={value}>{children}</EventContext.Provider>
  )
}

