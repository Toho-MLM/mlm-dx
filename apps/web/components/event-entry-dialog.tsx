'use client'

import { useState, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { Event } from '@/app/types'

interface Group {
  id: string
  name: string
  is_main: boolean
}

interface EventEntryDialogProps {
  event: Event
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function EventEntryDialog({ event, isOpen, onClose, onSuccess }: EventEntryDialogProps) {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadGroups()
      loadExistingEntries()
    }
  }, [isOpen, event.id])

  const loadGroups = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getGroupOptions()
      if (response.success && response.data) {
        setGroups(response.data)
      }
    } catch (error) {
      console.error('Error loading groups:', error)
      toast.error('グループの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const loadExistingEntries = async () => {
    try {
      const response = await apiClient.getEntries(event.id)
      if (response.success && response.data) {
        setSelectedGroups(response.data.map(entry => entry.group_id))
      }
    } catch (error) {
      console.error('Error loading entries:', error)
    }
  }

  const handleSelectGroup = (groupId: string) => {
    if (!groupId) return
    if (selectedGroups.includes(groupId)) {
      toast.error('このグループは既に追加されています')
      return
    }
    if (selectedGroups.length >= event.group_limit) {
      toast.error(`最大${event.group_limit}バンドまで登録可能です`)
      return
    }
    setSelectedGroups(prev => [...prev, groupId])
    setSelectedGroupId('')
  }

  const handleRemoveGroup = (groupId: string) => {
    setSelectedGroups(prev => prev.filter(id => id !== groupId))
  }

  const availableGroups = groups.filter(group => !selectedGroups.includes(group.id) && !group.is_main)

  const getGroupName = (groupId: string) => {
    return groups.find(g => g.id === groupId)?.name || groupId
  }

  const handleSubmit = async () => {
    if (selectedGroups.length === 0) {
      toast.error('少なくとも1つのグループを追加してください')
      return
    }

    try {
      setSubmitting(true)
      const response = await apiClient.createEntries({
        event_id: event.id,
        group_ids: selectedGroups,
      })

      if (response.success) {
        toast.success('参加登録が完了しました')
        onSuccess()
        onClose()
      } else {
        if (response.error === 'NO_VALID_GROUPS') {
          toast.error('登録可能なグループがありません')
        } else if (response.error === 'GROUP_LIMIT_EXCEEDED') {
          const members = (response as any).members || [];
          if (members.length > 0) {
            const memberNames = members.join('、');
            toast.error(`${memberNames}のバンド登録数が上限を超えています`)
          } else {
            toast.error('メンバーのバンド登録数が上限を超えています')
          }
        } else {
          toast.error('参加登録中にエラーが発生しました')
        }
      }
    } catch (error) {
      console.error('Error submitting entry:', error)
      toast.error('エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (!event.is_entry_accepting) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>参加登録は終了しました</DialogTitle>
            <DialogDescription>
              このイベントの受け付けは終了しました
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>参加登録</DialogTitle>
          <DialogDescription>
            イベントに参加するグループを追加してください（最大{event.group_limit}バンド）
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          {selectedGroups.map((groupId) => (
            <div key={groupId} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
              <span className="text-sm">{getGroupName(groupId)}</span>
              <button
                onClick={() => handleRemoveGroup(groupId)}
                className="text-gray-400 hover:text-red-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          
          <Select
            value={selectedGroupId}
            onValueChange={handleSelectGroup}
            disabled={availableGroups.length === 0 || selectedGroups.length >= event.group_limit}
          >
            <SelectTrigger>
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
              登録中: {selectedGroups.length} / {event.group_limit}
            </div>
          )}
        </div>
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
            disabled={selectedGroups.length === 0 || loading}
            isLoading={submitting}
          >
            作成
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
