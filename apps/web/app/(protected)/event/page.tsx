'use client'

import { useEffect, useState, useTransition } from 'react'
import { EventCard } from "./event-card"
import { EventForm } from "./event-form"
import { Event } from "@/app/types"
import { useRouter } from 'next/navigation'
import { EventPageHeader } from '@/components/event-page-header'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'
// removed server actions usage
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'
import { EventProvider } from './event-context'

export default function Page() {
  const [events, setEvents] = useState<Event[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [groupOptions, setGroupOptions] = useState<Array<{ id: string; name: string; is_main: boolean }>>([])
  const [entries, setEntries] = useState<Array<{ id: string; event_id: string; group_id: string; note?: string | null; created_at: string }>>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | undefined>()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)

  const fetchAggregates = async () => {
    try {
      setLoadingEntries(true)
      const [groupsRes, entriesRes] = await Promise.all([
        apiClient.getGroupOptions(!!isUserAdmin),
        apiClient.getEntries(),
      ])
      if (groupsRes.success && groupsRes.data) setGroupOptions(groupsRes.data)
      if (entriesRes.success && entriesRes.data) setEntries(entriesRes.data)
    } finally {
      setLoadingEntries(false)
    }
  }

  const fetchEvents = async () => {
    try {
      setLoadingEvents(true)
      const res = await apiClient.getEvents()
      if (res.success && res.data) setEvents(res.data)
    } finally {
      setLoadingEvents(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    fetchAggregates()
  }, [])

  const handleEdit = (id: string) => {
    const event = events.find(e => e.id === id)
    if (event) {
      setEditingEvent(event)
      setIsFormOpen(true)
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeletingEventId(id)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingEventId) return
    
    startTransition(async () => {
      try {
        const response = await apiClient.deleteEvent(deletingEventId)
        if (response.success) {
          setEvents(prev => prev.filter(e => e.id !== deletingEventId))
          toast.success('イベントを削除しました')
        } else {
          toast.error('イベントの削除中にエラーが発生しました')
        }
      } catch (error) {
        console.error('Error deleting event:', error)
        toast.error('エラーが発生しました')
      } finally {
        setIsDeleteDialogOpen(false)
        setDeletingEventId(null)
      }
    })
  }

  const handleAdd = () => {
    setEditingEvent(undefined)
    setIsFormOpen(true)
  }

  const handleSuccess = (newEvent?: Event) => {
    setIsFormOpen(false)
    if (newEvent) {
      if (editingEvent) {
        setEvents(prev => prev.map(e => e.id === newEvent.id ? newEvent : e))
      } else {
        setEvents(prev => [newEvent, ...prev])
      }
    } else {
      fetchEvents()
    }
  }

  const handleRefresh = async () => {
    try {
      await fetchEvents()
      fetchAggregates()
    } catch (error) {
      console.error('Failed to refresh events:', error)
    }
  }

  const handleEntriesChanged = () => {
    fetchAggregates()
  }

  if (loadingEvents) {
    const placeholder: Event = {
      id: 'placeholder',
      title: '',
      event_date: new Date().toISOString(),
      entry_deadline: new Date().toISOString(),
      is_entry_accepting: true,
      setlist_deadline: new Date().toISOString(),
      is_setlist_accepting: true,
      group_limit: 1,
      song_limit: 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return (
      <>
        <EventPageHeader 
          onAddEvent={isUserAdmin ? handleAdd : undefined}
          onRefresh={handleRefresh}
        />
        <div className="p-4 pt-0 mx-auto">
          <EventProvider value={{ groupOptions: [], userEntries: [], loadingEntries: true, onEntriesChanged: handleEntriesChanged }}>
            <div className="space-y-5">
              <EventCard
                event={placeholder}
              />
            </div>
          </EventProvider>
        </div>
      </>
    )
  }

  return (
    <>
      <EventPageHeader 
        onAddEvent={isUserAdmin ? handleAdd : undefined}
        onRefresh={handleRefresh}
      />
      <div className="p-4 pt-0 mx-auto">
      <EventProvider value={{ groupOptions, userEntries: entries, loadingEntries, onEntriesChanged: handleEntriesChanged, onEdit: isUserAdmin ? handleEdit : undefined, onDelete: isUserAdmin ? handleDeleteClick : undefined }}>
        <div className="space-y-5">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
            />
          ))}
        </div>
      </EventProvider>
      {isUserAdmin && (
        <EventForm
          event={editingEvent}
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>イベントの削除</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              このイベントを削除しますか？この操作は取り消せません。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}

