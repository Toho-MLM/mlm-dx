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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { SetlistItem, Entry } from '@/app/types'

interface SetlistDialogProps {
  entry: Entry
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function SetlistDialog({ entry, isOpen, onClose, onSuccess }: SetlistDialogProps) {
  const [setlistItems, setSetlistItems] = useState<SetlistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSetlist()
    }
  }, [isOpen, entry.id])

  const loadSetlist = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getSetlistItems(entry.id)
      if (response.success && response.data) {
        setSetlistItems(response.data)
      }
    } catch (error) {
      console.error('Error loading setlist:', error)
      toast.error('セットリストの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = () => {
    setSetlistItems([...setlistItems, {
      id: `new-${crypto.randomUUID()}`,
      entry_id: entry.id,
      position: setlistItems.length + 1,
      title: '',
      artist: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
  }

  const handleDeleteItem = async (itemId: string) => {
    if (itemId.startsWith('new-')) {
      setSetlistItems(items => items.filter(item => item.id !== itemId))
      return
    }

    try {
      await apiClient.deleteSetlistItem(itemId)
      toast.success('曲を削除しました')
      await loadSetlist()
      onSuccess()
    } catch (error) {
      console.error('Error deleting setlist item:', error)
      toast.error('曲の削除に失敗しました')
    }
  }

  const handleUpdateItem = (itemId: string, field: 'title' | 'artist', value: string) => {
    setSetlistItems(items => items.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: value || '' }
      }
      return item
    }))
  }

  const handleSave = async () => {
    try {
      setSubmitting(true)
      
      for (const item of setlistItems) {
        if (item.id.startsWith('new-')) {
          await apiClient.createSetlistItem({
            entry_id: entry.id,
            position: item.position,
            title: item.title,
            artist: item.artist || '',
          })
        } else {
          await apiClient.updateSetlistItem(item.id, {
            position: item.position,
            title: item.title,
            artist: item.artist || '',
          })
        }
      }
      
      toast.success('セットリストを保存しました')
      onClose()
      onSuccess()
    } catch (error) {
      console.error('Error saving setlist:', error)
      toast.error('セットリストの保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>セットリストを読み込み中...</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>セットリスト</DialogTitle>
          <DialogDescription>
            演奏する曲を順番に登録してください
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-3 max-h-[400px] overflow-y-auto">
          {setlistItems.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              まだ曲が登録されていません
            </div>
          ) : (
            setlistItems.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <GripVertical className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500 w-6">
                    {index + 1}
                  </span>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-gray-600">曲名</Label>
                    <Input
                      value={item.title}
                      onChange={(e) => handleUpdateItem(item.id, 'title', e.target.value)}
                      placeholder="曲名"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">アーティスト</Label>
                    <Input
                      value={item.artist || ''}
                      onChange={(e) => handleUpdateItem(item.id, 'artist', e.target.value)}
                      placeholder="アーティスト名"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteItem(item.id)}
                  className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-between items-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleAddItem}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            曲を追加
          </Button>
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
            onClick={handleSave}
            isLoading={submitting}
            disabled={submitting}
          >
            保存
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

