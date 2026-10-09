'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/context/AuthContext'
import { useAdminMode } from '@/hooks/use-admin-mode'
import { isAdmin } from '@shared-schemas'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { apiClient } from '@/lib/api'
import { HttpError } from '@/lib/http-client'
import { toast } from '@/lib/toast'
import { showSuccessToast } from '@/lib/utils'
import { Event } from '@/app/types'

interface Group {
  id: string
  name: string
  main_index: number | null
}

interface EventEntryDialogProps {
  event: Event
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function EventEntryDialog({ event, isOpen, onClose, onSuccess }: EventEntryDialogProps) {
  const { user } = useAuth()
  const [isAdminMode] = useAdminMode(user && isAdmin(user.role))
  const canRegister = event.is_entry_accepting || isAdminMode
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [submitting, setSubmitting] = useState(false)


  useEffect(() => {
    if (isOpen && !canRegister) {
      toast.error('参加登録の受け付けは終了しています', { id: `event-entry-closed-${event.id}` })
      onClose()
    }
  }, [canRegister, event.id, isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !canRegister) return
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setLoadError(false)
        setSelectedGroupId('')
        const [groupsResponse, entriesResponse] = await Promise.all([
          apiClient.getGroupOptions(isAdminMode),
          apiClient.getEntries(event.id),
        ])
        if (cancelled) return
        if (!groupsResponse.success || !entriesResponse.success) {
          throw new Error('ENTRY_DATA_FETCH_FAILED')
        }
        setGroups(groupsResponse.data ?? [])
        setSelectedGroups((entriesResponse.data ?? []).map(entry => entry.group_id))
      } catch (error) {
        if (cancelled) return
        console.error('Error loading entry data:', error)
        setLoadError(true)
        toast.error('参加登録の情報を取得できませんでした', { description: '閉じてもう一度開いてください。' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [canRegister, event.id, isAdminMode, isOpen])

  const handleSelectGroup = (groupId: string) => {
    if (!groupId) return
    if (selectedGroups.includes(groupId)) {
      toast.error('このグループは既に追加されています')
      return
    }
    if (!isAdminMode && selectedGroups.length >= event.group_limit) {
      toast.error(`最大${event.group_limit}バンドまで登録可能です`)
      return
    }
    setSelectedGroups(prev => [...prev, groupId])
    setSelectedGroupId('')
  }

  const handleRemoveGroup = (groupId: string) => {
    setSelectedGroups(prev => prev.filter(id => id !== groupId))
  }

  const availableGroups = groups.filter(group => !selectedGroups.includes(group.id) && group.main_index === null)

  const getGroupName = (groupId: string) => {
    return groups.find(g => g.id === groupId)?.name || groupId
  }

  const handleSubmit = async () => {
    if (submitting || loading || loadError || !canRegister) return
    if (selectedGroups.length === 0) {
      toast.error('少なくとも1つのグループを追加してください')
      return
    }

    try {
      setSubmitting(true)
      const response = await apiClient.createEntries({
        event_id: event.id,
        group_ids: selectedGroups,
      }, isAdminMode)

      if (response.success) {
        showSuccessToast({ message: '参加登録が完了しました' })
        onSuccess()
        onClose()
      } else {
        toast.error('参加登録できませんでした')
      }
    } catch (error) {
      console.error('Error submitting entry:', error)
      if (error instanceof HttpError) {
        if (error.data?.error === 'NO_VALID_GROUPS') {
          toast.error('登録可能なグループがありません')
        } else if (error.data?.error === 'ENTRY_NOT_ACCEPTING') {
          toast.error('参加登録の受け付けは終了しています')
        } else if (error.data?.error === 'GROUP_LIMIT_EXCEEDED') {
          const members = error.data.members || []
          if (members.length > 0) {
            const memberNames = members.join('、')
            toast.error(`${memberNames}のバンド登録数が上限を超えています`)
          } else {
            toast.error('メンバーのバンド登録数が上限を超えています')
          }
        } else {
          toast.error('参加登録中にエラーが発生しました')
        }
      } else {
        toast.error('エラーが発生しました')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!canRegister) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !submitting) onClose() }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>参加登録</DialogTitle>
          <DialogDescription>
            {isAdminMode ? 'バンドごとにメンバーの参加上限が適用されます。' : `最大${event.group_limit}バンドまで登録できます。`}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={loading || submitting || loadError} className="py-4 space-y-2">
          {loading ? <Skeleton className="h-9 w-full" /> : <>
          {selectedGroups.map((groupId) => (
            <div key={groupId} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
              <span className="text-sm">{getGroupName(groupId)}</span>
              <button
                type="button"
                onClick={() => handleRemoveGroup(groupId)}
                className="text-gray-400 hover:text-red-600 p-1"
                aria-label={`${getGroupName(groupId)}を選択から外す`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          
          <Label htmlFor={`entry-group-${event.id}`}>追加するバンド</Label>
          <Select
            value={selectedGroupId}
            onValueChange={handleSelectGroup}
            disabled={loading || submitting || availableGroups.length === 0 || (!isAdminMode && selectedGroups.length >= event.group_limit)}
          >
            <SelectTrigger id={`entry-group-${event.id}`}>
              <SelectValue placeholder="グループを追加" />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedGroups.length > 0 && (
            <div className="text-sm text-gray-600 pt-2">
              {isAdminMode ? `${selectedGroups.length}バンド選択中` : `登録中: ${selectedGroups.length} / ${event.group_limit}`}
            </div>
          )}
          </>}
        </fieldset>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            キャンセル
          </Button>
          <LoadingButton
            type="button"
            onClick={handleSubmit}
            disabled={selectedGroups.length === 0 || loading || loadError}
            isLoading={submitting}
          >
            登録
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
