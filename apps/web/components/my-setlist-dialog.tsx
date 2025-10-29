'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { Music, FileText, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Entry, SetlistItem } from '@/app/types'

interface MySetlistDialogProps {
  eventId: string
  eventTitle: string
  event: { song_limit: number } | null
  isOpen: boolean
  onClose: () => void
}

interface EntryWithSetlist {
  entry: Entry
  groupName: string
  setlistItems: SetlistItem[]
}

export function MySetlistDialog({ eventId, eventTitle, event, isOpen, onClose }: MySetlistDialogProps) {
  const [entriesWithSetlist, setEntriesWithSetlist] = useState<EntryWithSetlist[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const [editingItems, setEditingItems] = useState<Map<string, SetlistItem[]>>(new Map())
  const [submitting, setSubmitting] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, eventId])

  const loadData = async () => {
    try {
      setLoading(true)
      const [entriesResponse, groupsResponse] = await Promise.all([
        apiClient.getEntries(eventId),
        apiClient.getGroupOptions(),
      ])
      
      if (groupsResponse.success && groupsResponse.data) {
        const groupMap = new Map(groupsResponse.data.map(g => [g.id, g.name]))
        
        if (entriesResponse.success && entriesResponse.data) {
          const entriesWithSetlists: EntryWithSetlist[] = []
          for (const entry of entriesResponse.data) {
            const setlistResponse = await apiClient.getSetlistItems(entry.id)
            const items = setlistResponse.success && setlistResponse.data ? setlistResponse.data : []
            entriesWithSetlists.push({
              entry: entry as Entry,
              groupName: groupMap.get(entry.group_id) || '不明なグループ',
              setlistItems: items.map(item => ({
                ...item,
                artist: item.artist || ''
              })),
            })
          }
          setEntriesWithSetlist(entriesWithSetlists)
          const editingMap = new Map<string, SetlistItem[]>()
          entriesWithSetlists.forEach(item => {
            editingMap.set(item.entry.id, item.setlistItems)
          })
          setEditingItems(editingMap)
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleExpanded = (entryId: string) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev)
      if (newSet.has(entryId)) {
        newSet.delete(entryId)
      } else {
        newSet.add(entryId)
      }
      return newSet
    })
  }

  const handleAddItem = (entryId: string) => {
    const items = editingItems.get(entryId) || []
    const songLimit = event?.song_limit || 10
    
    if (items.length >= songLimit) {
      toast.error(`最大${songLimit}曲まで登録可能です`)
      return
    }
    
    const newItems = [...items, {
      id: `new-${Date.now()}`,
      entry_id: entryId,
      position: items.length + 1,
      title: '',
      artist: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]
    setEditingItems(new Map(editingItems.set(entryId, newItems)))
  }

  const handleDeleteItem = (entryId: string, itemId: string) => {
    const items = editingItems.get(entryId) || []
    const newItems = items.filter(item => item.id !== itemId)
    setEditingItems(new Map(editingItems.set(entryId, newItems)))
  }

  const handleUpdateItem = (entryId: string, itemId: string, field: 'title' | 'artist', value: string) => {
    const items = editingItems.get(entryId) || []
    const newItems = items.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: value || null }
      }
      return item
    })
    setEditingItems(new Map(editingItems.set(entryId, newItems)))
  }

  const handleSave = async (entryId: string) => {
    const items = editingItems.get(entryId) || []
    
    if (items.some(item => !item.title || !item.artist)) {
      toast.error('曲名とアーティスト名は必須です')
      return
    }
    
    try {
      setSubmitting(new Map(submitting.set(entryId, true)))
      
      for (const [index, item] of items.entries()) {
        if (item.id.startsWith('new-')) {
          await apiClient.createSetlistItem({
            entry_id: entryId,
            position: index + 1,
            title: item.title,
            artist: item.artist || '',
          })
        } else {
          await apiClient.updateSetlistItem(item.id, {
            position: index + 1,
            title: item.title,
            artist: item.artist || '',
          })
        }
      }
      
      toast.success('セットリストを保存しました')
      loadData()
    } catch (error) {
      console.error('Error saving setlist:', error)
      toast.error('セットリストの保存に失敗しました')
    } finally {
      setSubmitting(new Map(submitting.set(entryId, false)))
    }
  }

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{eventTitle} - セットリスト</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{eventTitle} - セットリスト</DialogTitle>
          <DialogDescription>
            あなたの所属バンドのセットリストを表示・編集できます
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 max-h-[500px] overflow-y-auto">
          {entriesWithSetlist.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              まだエントリーがありません
            </div>
          ) : (
            <div className="space-y-3">
              {entriesWithSetlist.map((item) => {
                const isExpanded = expandedEntries.has(item.entry.id)
                const editingSet = editingItems.get(item.entry.id) || []
                
                return (
                  <div key={item.entry.id} className="border rounded-lg">
                    <div
                      className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleToggleExpanded(item.entry.id)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Badge variant="secondary">
                          {item.groupName}
                        </Badge>
                        {item.entry.note && (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <FileText className="h-4 w-4" />
                            <span className="truncate max-w-xs">{item.entry.note}</span>
                          </div>
                        )}
                        {editingSet.length > 0 && (
                          <Badge variant="outline">
                            {editingSet.length}曲
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t p-4 space-y-4">
                        <div className="space-y-2">
                          {editingSet.map((setlistItem, index) => (
                            <div
                              key={setlistItem.id}
                              className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50"
                            >
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Music className="h-4 w-4 text-gray-400" />
                                <span className="text-sm font-medium text-gray-500 w-6">
                                  {index + 1}.
                                </span>
                              </div>
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <Input
                                  value={setlistItem.title}
                                  onChange={(e) => handleUpdateItem(item.entry.id, setlistItem.id, 'title', e.target.value)}
                                  placeholder="曲名"
                                />
                                <Input
                                  value={setlistItem.artist || ''}
                                  onChange={(e) => handleUpdateItem(item.entry.id, setlistItem.id, 'artist', e.target.value)}
                                  placeholder="アーティスト名"
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteItem(item.entry.id, setlistItem.id)}
                                className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleAddItem(item.entry.id)}
                            disabled={submitting.get(item.entry.id)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            曲を追加
                          </Button>
                          <LoadingButton
                            onClick={() => handleSave(item.entry.id)}
                            isLoading={submitting.get(item.entry.id)}
                            disabled={submitting.get(item.entry.id)}
                          >
                            保存
                          </LoadingButton>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
