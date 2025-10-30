'use client'

import { useEffect, useMemo, useState } from 'react'
import { Event, Entry, SetlistItem } from '@/app/types'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import { SongTitleInput } from '@/components/song-title-input'
import { ChevronDown, ChevronUp, FileText, Music, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSearchParams } from 'next/navigation'
 


interface EntryWithSetlist {
  entry: Entry
  groupName: string
  setlistItems: SetlistItem[]
}

export function SetlistPageClient() {
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [entriesWithSetlist, setEntriesWithSetlist] = useState<EntryWithSetlist[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const [editingItems, setEditingItems] = useState<Map<string, SetlistItem[]>>(new Map())
  const [submitting, setSubmitting] = useState<Map<string, boolean>>(new Map())

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId) || null, [events, selectedEventId])

  // 初期ロード: イベント一覧取得とクエリからの選択ID設定
  useEffect(() => {
    const init = async () => {
      try {
        setEventsLoading(true)
        const res = await apiClient.getEvents()
        if (res.success && res.data) setEvents(res.data)
      } finally {
        setEventsLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    const id = searchParams.get('eventId')
    setSelectedEventId(id || null)
  }, [searchParams])

  // フィルターがない場合は自動選択せず、全イベント表示

  useEffect(() => {
    if (selectedEventId) {
      fetchEventSetlist(selectedEventId)
    }
  }, [selectedEventId])

  const fetchEventSetlist = async (eventId: string) => {
    try {
      setLoading(true)
      const bundle = await apiClient.getEventSetlist(eventId)
      if (bundle.success && bundle.data) {
        const entriesWithSetlists: EntryWithSetlist[] = bundle.data.map(b => ({
          entry: b.entry as Entry,
          groupName: b.group_name,
          setlistItems: b.setlist_items.map(i => ({ ...i, artist: i.artist || '' })),
        }))
        setEntriesWithSetlist(entriesWithSetlists)
        const editingMap = new Map<string, SetlistItem[]>()
        entriesWithSetlists.forEach(item => {
          editingMap.set(item.entry.id, item.setlistItems)
        })
        setEditingItems(editingMap)
      }
    } catch (error) {
      toast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleExpanded = (entryId: string) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev)
      if (newSet.has(entryId)) newSet.delete(entryId)
      else newSet.add(entryId)
      return newSet
    })
  }

  const handleAddItem = (entryId: string) => {
    const items = editingItems.get(entryId) || []
    const songLimit = selectedEvent?.song_limit || 10
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
    } as SetlistItem]
    setEditingItems(new Map(editingItems.set(entryId, newItems)))
  }

  const handleDeleteItem = (entryId: string, itemId: string) => {
    const items = editingItems.get(entryId) || []
    const newItems = items.filter(item => item.id !== itemId)
    setEditingItems(new Map(editingItems.set(entryId, newItems)))
  }

  const handleUpdateItem = (entryId: string, itemId: string, field: 'title' | 'artist', value: string) => {
    const items = editingItems.get(entryId) || []
    const newItems = items.map(item => item.id === itemId ? { ...item, [field]: value || '' } : item)
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
      if (selectedEventId) {
        fetchEventSetlist(selectedEventId)
      }
    } catch {
      toast.error('セットリストの保存に失敗しました')
    } finally {
      setSubmitting(new Map(submitting.set(entryId, false)))
    }
  }

  const handleRefresh = () => {
    if (selectedEventId) {
      fetchEventSetlist(selectedEventId)
    } else {
      setRefreshKey((k) => k + 1)
    }
  }

  const rightActions = (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={handleRefresh}>
        更新
      </Button>
      {selectedEventId && (
        <Button size="sm" variant="outline" onClick={() => setSelectedEventId(null)}>
          全イベント表示
        </Button>
      )}
    </div>
  )

  function EventSetlistSection({ event, refreshKey }: { event: Event, refreshKey: number }) {
    const [sectionLoading, setSectionLoading] = useState(true)
    const [sectionExpandedEntries, setSectionExpandedEntries] = useState<Set<string>>(new Set())
    const [sectionEditingItems, setSectionEditingItems] = useState<Map<string, SetlistItem[]>>(new Map())
    const [sectionSubmitting, setSectionSubmitting] = useState<Map<string, boolean>>(new Map())
    const [sectionEntriesWithSetlist, setSectionEntriesWithSetlist] = useState<EntryWithSetlist[]>([])

    const loadSectionData = async () => {
      try {
        setSectionLoading(true)
        const bundle = await apiClient.getEventSetlist(event.id)
        if (bundle.success && bundle.data) {
          const result: EntryWithSetlist[] = bundle.data.map(b => ({
            entry: b.entry as Entry,
            groupName: b.group_name,
            setlistItems: b.setlist_items.map(i => ({ ...i, artist: i.artist || '' })),
          }))
          setSectionEntriesWithSetlist(result)
          const map = new Map<string, SetlistItem[]>()
          result.forEach(it => map.set(it.entry.id, it.setlistItems))
          setSectionEditingItems(map)
        }
      } catch {
        toast.error('データの取得に失敗しました')
      } finally {
        setSectionLoading(false)
      }
    }

    useEffect(() => {
      loadSectionData()
    }, [event.id, refreshKey])

    const toggle = (entryId: string) => {
      setSectionExpandedEntries(prev => {
        const ns = new Set(prev)
        if (ns.has(entryId)) ns.delete(entryId); else ns.add(entryId)
        return ns
      })
    }

    const addItem = (entryId: string) => {
      const items = sectionEditingItems.get(entryId) || []
      const limit = event.song_limit || 10
      if (items.length >= limit) {
        toast.error(`最大${limit}曲まで登録可能です`)
        return
      }
      const newItems = [...items, { id: `new-${Date.now()}`, entry_id: entryId, position: items.length + 1, title: '', artist: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as SetlistItem]
      setSectionEditingItems(new Map(sectionEditingItems.set(entryId, newItems)))
    }

    const delItem = (entryId: string, itemId: string) => {
      const items = sectionEditingItems.get(entryId) || []
      const newItems = items.filter(i => i.id !== itemId)
      setSectionEditingItems(new Map(sectionEditingItems.set(entryId, newItems)))
    }

    const updItem = (entryId: string, itemId: string, field: 'title' | 'artist', value: string) => {
      const items = sectionEditingItems.get(entryId) || []
      const newItems = items.map(i => i.id === itemId ? { ...i, [field]: value || '' } : i)
      setSectionEditingItems(new Map(sectionEditingItems.set(entryId, newItems)))
    }

    const save = async (entryId: string) => {
      const items = sectionEditingItems.get(entryId) || []
      if (items.some(i => !i.title || !i.artist)) {
        toast.error('曲名とアーティスト名は必須です')
        return
      }
      try {
        setSectionSubmitting(new Map(sectionSubmitting.set(entryId, true)))
        for (const [index, item] of items.entries()) {
          if (item.id.startsWith('new-')) {
            await apiClient.createSetlistItem({ entry_id: entryId, position: index + 1, title: item.title, artist: item.artist || '' })
          } else {
            await apiClient.updateSetlistItem(item.id, { position: index + 1, title: item.title, artist: item.artist || '' })
          }
        }
        toast.success('セットリストを保存しました')
        loadSectionData()
      } catch {
        toast.error('セットリストの保存に失敗しました')
      } finally {
        setSectionSubmitting(new Map(sectionSubmitting.set(entryId, false)))
      }
    }

    return (
      <Card className="max-w-5xl mx-auto w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">{event.title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <Badge variant={event.is_setlist_accepting ? 'secondary' : 'destructive'}>
              {event.is_setlist_accepting ? '受付中' : '受付終了'}
            </Badge>
            <span>締切: {new Date(new Date(event.setlist_deadline).setDate(new Date(event.setlist_deadline).getDate() - 1)).toLocaleDateString('ja-JP')}</span>
            <span>曲数上限: {event.song_limit}</span>
          </div>

          {sectionLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {sectionEntriesWithSetlist.length === 0 ? (
                <div className="text-center text-gray-500 py-8">まだエントリーがありません</div>
              ) : (
                sectionEntriesWithSetlist.map(item => {
                  const isExpanded = sectionExpandedEntries.has(item.entry.id)
                  const editingSet = sectionEditingItems.get(item.entry.id) || []
                  return (
                    <div key={item.entry.id} className="border rounded-lg">
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer" onClick={() => toggle(item.entry.id)}>
                        <div className="flex items-center gap-3 flex-1">
                          <Badge variant="secondary">{item.groupName}</Badge>
                          {item.entry.note && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <FileText className="h-4 w-4" />
                              <span className="truncate max-w-xs">{item.entry.note}</span>
                            </div>
                          )}
                          {editingSet.length > 0 && (
                            <Badge variant="outline">{editingSet.length}曲</Badge>
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
                              <div key={setlistItem.id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Music className="h-4 w-4 text-gray-400" />
                                  <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                                </div>
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <SongTitleInput
                                    value={setlistItem.title}
                                    onChange={(v) => updItem(item.entry.id, setlistItem.id, 'title', v)}
                                    onSelectSuggestion={({ title, artist }) => {
                                      updItem(item.entry.id, setlistItem.id, 'title', title)
                                      updItem(item.entry.id, setlistItem.id, 'artist', artist)
                                    }}
                                    placeholder="曲名"
                                    limit={20}
                                  />
                                  <Input
                                    value={setlistItem.artist || ''}
                                    onChange={(e) => updItem(item.entry.id, setlistItem.id, 'artist', e.target.value)}
                                    placeholder="アーティスト名"
                                  />
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => delItem(item.entry.id, setlistItem.id)} className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => addItem(item.entry.id)} disabled={sectionSubmitting.get(item.entry.id)}>
                              <Plus className="mr-2 h-4 w-4" />
                              曲を追加
                            </Button>
                            <LoadingButton onClick={() => save(item.entry.id)} isLoading={sectionSubmitting.get(item.entry.id)} disabled={sectionSubmitting.get(item.entry.id)}>
                              保存
                            </LoadingButton>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <PageHeader rightActions={rightActions} />
      <div className="p-5 space-y-6">
        {selectedEventId ? (
          selectedEvent ? (
            <EventSetlistSection event={selectedEvent} refreshKey={refreshKey} />
          ) : (
            <Card className="max-w-5xl mx-auto w-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  <Skeleton className="h-5 w-40" />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          (eventsLoading ? (
            <Card className="max-w-5xl mx-auto w-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  <Skeleton className="h-5 w-40" />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </CardContent>
            </Card>
          ) : (
            [...events].sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()).map(ev => (
            <EventSetlistSection key={ev.id} event={ev} refreshKey={refreshKey} />
            ))
          ))
        )}
      </div>
    </>
  )
}


