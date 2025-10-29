'use client'

import { useState } from 'react'
import { EventCard } from "./event-card"
import { EventForm } from "./event-form"
import { Event } from "@/app/types"
import { useRouter } from 'next/navigation'
import { EventPageHeader } from '@/components/event-page-header'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function EventList({ events }: { events: Event[] }) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | undefined>()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const router = useRouter()
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)

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
    
    try {
      const response = await apiClient.deleteEvent(deletingEventId)
      
      if (response.success) {
        toast.success('イベントを削除しました')
        router.refresh()
      } else {
        if (response.error === 'INSUFFICIENT_PERMISSIONS') {
          toast.error('管理者権限が必要です')
        } else {
          toast.error('イベントの削除中にエラーが発生しました')
        }
      }
    } catch (error) {
      console.error('Error deleting event:', error)
      toast.error('エラーが発生しました')
    } finally {
      setIsDeleteDialogOpen(false)
      setDeletingEventId(null)
    }
  }

  const handleAdd = () => {
    setEditingEvent(undefined)
    setIsFormOpen(true)
  }

  const handleSuccess = (newEvent?: Event) => {
    setIsFormOpen(false)
    if (newEvent) {
      router.refresh()
    } else {
      router.refresh()
    }
  }

  const handleRefresh = async () => {
    try {
      router.refresh()
    } catch (error) {
      console.error('Failed to refresh events:', error)
      router.refresh()
    }
  }

  return (
    <>
      <EventPageHeader 
        onAddEvent={isUserAdmin ? handleAdd : undefined}
        onRefresh={handleRefresh}
      />
      <div className="p-5">
      <div className="space-y-5">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onEdit={isUserAdmin ? handleEdit : undefined}
            onDelete={isUserAdmin ? handleDeleteClick : undefined}
          />
        ))}
      </div>
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
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}

