'use client'

import React, { useEffect, useMemo, useState, Suspense, useCallback } from 'react'
import { memo } from 'react'
import { useRef } from 'react'
import { forwardRef, useImperativeHandle } from 'react'
import { Event, Entry, SetlistItem } from '@/app/types'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import { SongTitleInput } from '@/components/song-title-input'
import { Music, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'

interface EntryWithSetlist {
  entry: Entry
  groupName: string
  setlistItems: SetlistItem[]
}

function EventSetlistSectionBase({ event, onEdit, isAdminMode = false }: { event: Event, onEdit: (item: EntryWithSetlist) => void, isAdminMode?: boolean }, ref: React.Ref<{ reload: () => void }>) {
  const [sectionLoading, setSectionLoading] = useState(true)
  const [sectionEntriesWithSetlist, setSectionEntriesWithSetlist] = useState<EntryWithSetlist[]>([])

  const loadSectionData = useCallback(async () => {
    try {
      setSectionLoading(true)
      const bundle = await apiClient.getEventSetlist(event.id, isAdminMode)
      if (bundle.success && bundle.data) {
        const result: EntryWithSetlist[] = bundle.data.map(b => ({
          entry: b.entry as Entry,
          groupName: b.group_name,
          setlistItems: b.setlist_items.map(i => ({
            id: `${b.entry.id}-${i.position}`,
            entry_id: b.entry.id,
            position: i.position,
            title: i.title,
            artist: i.artist || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as SetlistItem)),
        }))
        setSectionEntriesWithSetlist(result)
      }
    } catch {
      toast.error('データの取得に失敗しました')
    } finally {
      setSectionLoading(false)
    }
  }, [event.id, isAdminMode])

  useEffect(() => {
    loadSectionData()
  }, [loadSectionData])

  useImperativeHandle(ref, () => ({
    reload: () => {
      loadSectionData()
    },
  }))

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
                return (
                  <div key={item.entry.id} className="border rounded-lg">
                    <div className="flex items-center justify-between gap-2 p-2 bg-gray-100 rounded-md">
                      <div className="flex items-baseline gap-4 min-w-0">
                        <span className="font-bold ml-2">{item.groupName}</span>
                      </div>
                      <Button variant="outline" size="sm" className="w-auto self-start flex-shrink-0" onClick={() => onEdit(item)} disabled={!event.is_setlist_accepting}>
                        編集
                      </Button>
                    </div>
                    <div className="border-t p-4 space-y-2">
                      {item.setlistItems.length === 0 ? (
                        <span className="text-gray-400">セットリスト未登録</span>
                      ) : (
                        (() => {
                          const sorted = [...item.setlistItems].sort((a, b) => a.position - b.position)
                          return (
                            <>
                              {sorted.map((s) => (
                                <div key={s.id} className="flex items-center gap-2">
                                  {s.position === 0 ? (
                                    <span className="text-sm font-medium text-gray-500 w-6 text-center">SE</span>
                                  ) : (
                                    <span className="text-sm font-medium text-gray-500 w-6 text-center">
                                      {sorted.filter(si => si.position > 0 && si.position <= s.position).length}
                                    </span>
                                  )}
                                  <span className="flex-1">{s.title} <span className="text-gray-400">/</span> {s.artist}</span>
                                </div>
                              ))}
                            </>
                          )
                        })()
                      )}
                      {item.entry.note && (
                        <div className="mt-4 border rounded p-3 text-sm text-gray-700 whitespace-pre-line break-words">
                          {item.entry.note}
                        </div>
                      )}
                    </div>
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

const EventSetlistSection = memo(forwardRef(EventSetlistSectionBase))

function SetlistContent() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editingItems, setEditingItems] = useState<Map<string, SetlistItem[]>>(new Map())
  const [submitting, setSubmitting] = useState<Map<string, boolean>>(new Map())
  const [editDialogEntry, setEditDialogEntry] = useState<EntryWithSetlist | null>(null)
  const [dialogSongLimit, setDialogSongLimit] = useState<number | null>(null)
  const [dialogAccepting, setDialogAccepting] = useState<boolean | null>(null)
  const editDialogOpenRef = useRef(false)
  const sectionRefs = useRef<Map<string, { reload: () => void }>>(new Map())
  const [editingEntryNote, setEditingEntryNote] = useState<string>('')
  const [entranceSEEnabled, setEntranceSEEnabled] = useState<Map<string, boolean>>(new Map())
  const [entranceSETitle, setEntranceSETitle] = useState<Map<string, string>>(new Map())
  const [entranceSEArtist, setEntranceSEArtist] = useState<Map<string, string>>(new Map())

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId) || null, [events, selectedEventId])

  const openEditDialog = (item: EntryWithSetlist) => {
    const entrance = item.setlistItems.find(i => i.position === 0)
    const hasEntrance = !!entrance
    const cloned = item.setlistItems.filter(i => i.position > 0).map(i => ({ ...i }))
    setEditingItems(prev => new Map(prev.set(item.entry.id, cloned)))
    setSubmitting(prev => new Map(prev.set(item.entry.id, false)))
    const ev = selectedEventId ? selectedEvent : events.find(e => e.id === item.entry.event_id) || null
    setDialogSongLimit(ev ? ev.song_limit : null)
    setDialogAccepting(ev ? ev.is_setlist_accepting : null)
    setEditDialogEntry(item)
    setEditingEntryNote(item.entry.note || '')
    setEntranceSEEnabled(prev => new Map(prev.set(item.entry.id, hasEntrance)))
    setEntranceSETitle(prev => new Map(prev.set(item.entry.id, entrance?.title || '')))
    setEntranceSEArtist(prev => new Map(prev.set(item.entry.id, entrance?.artist || '')))
    editDialogOpenRef.current = true
  }

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

  const fetchEventSetlist = useCallback(async (eventId: string) => {
    try {
      const bundle = await apiClient.getEventSetlist(eventId, isAdminMode)
      if (bundle.success && bundle.data) {
        const entriesWithSetlists: EntryWithSetlist[] = bundle.data.map(b => ({
          entry: b.entry as Entry,
          groupName: b.group_name,
          setlistItems: b.setlist_items.map(i => ({
            id: `${b.entry.id}-${i.position}`,
            entry_id: b.entry.id,
            position: i.position,
            title: i.title,
            artist: i.artist || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as SetlistItem)),
        }))
        const editingMap = new Map<string, SetlistItem[]>()
        entriesWithSetlists.forEach(item => {
          editingMap.set(item.entry.id, item.setlistItems)
        })
        setEditingItems(editingMap)
      }
    } catch (error) {
      toast.error('データの取得に失敗しました')
    }
  }, [isAdminMode])

  useEffect(() => {
    if (selectedEventId && !editDialogOpenRef.current) {
      fetchEventSetlist(selectedEventId)
    }
  }, [selectedEventId, fetchEventSetlist])

  const handleAddItem = (entryId: string) => {
    const items = editingItems.get(entryId) || []
    const limit = editDialogEntry && entryId === editDialogEntry.entry.id && dialogSongLimit ? dialogSongLimit : (selectedEvent?.song_limit || 10)
    if (items.length >= limit) {
      toast.error(`最大${limit}曲まで登録可能です`)
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
    if (entranceSEEnabled.get(entryId)) {
      const t = (entranceSETitle.get(entryId) || '').trim()
      const a = (entranceSEArtist.get(entryId) || '').trim()
      if (!t || !a) {
        toast.error('入場SEの曲名とアーティスト名は必須です')
        return
      }
    }
    try {
      setSubmitting(new Map(submitting.set(entryId, true)))
      const songsPayload = items.map(i => ({ title: i.title, artist: i.artist || '' }))
      const hasSE = !!entranceSEEnabled.get(entryId)
      const payload = hasSE
        ? [{ title: entranceSETitle.get(entryId) || '', artist: entranceSEArtist.get(entryId) || '' }, ...songsPayload]
        : songsPayload
      await apiClient.replaceSetlistItems(entryId, payload, hasSE)
      toast.success('セットリストを保存しました')
      if (selectedEventId) {
        sectionRefs.current.get(selectedEventId)?.reload()
      } else {
        const targetEventId = editDialogEntry?.entry.event_id
        if (targetEventId) sectionRefs.current.get(targetEventId)?.reload()
      }
    } catch {
      toast.error('セットリストの保存に失敗しました')
    } finally {
      setSubmitting(new Map(submitting.set(entryId, false)))
    }
  }

  const handleRefresh = () => {
    if (selectedEventId) {
      sectionRefs.current.get(selectedEventId)?.reload()
    } else {
      sectionRefs.current.forEach(api => api.reload())
    }
  }

  const handleAdminToggle = (checked: boolean) => {
    setIsAdminMode(checked)
  }

  const rightActions = (
    <div className="flex items-center gap-2">
      {isUserAdmin && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">管理者モード</span>
          <Switch checked={isAdminMode} onCheckedChange={handleAdminToggle} />
        </div>
      )}
      {!isUserAdmin && (
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          更新
        </Button>
      )}
    </div>
  )

  return (
    <>
      <PageHeader rightActions={rightActions} />
      <div className="p-4 pt-0 mx-auto space-y-4">
        {selectedEventId ? (
          selectedEvent ? (
            <>
              <EventSetlistSection
                ref={(api) => {
                  if (api) sectionRefs.current.set(selectedEvent.id, api)
                  else sectionRefs.current.delete(selectedEvent.id)
                }}
                event={selectedEvent}
                onEdit={openEditDialog}
                isAdminMode={isAdminMode}
              />
              <div className="max-w-5xl mx-auto w-full mt-3">
                <Button variant="outline" className="w-full" onClick={() => setSelectedEventId(null)}>
                  すべてのイベントを表示
                </Button>
              </div>
            </>
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
            <EventSetlistSection
              key={ev.id}
              ref={(api) => {
                if (api) sectionRefs.current.set(ev.id, api)
                else sectionRefs.current.delete(ev.id)
              }}
              event={ev}
              onEdit={openEditDialog}
              isAdminMode={isAdminMode}
            />
            ))
          ))
        )}
      </div>
      <Dialog open={!!editDialogEntry} onOpenChange={(o) => { if (!o) setEditDialogEntry(null) }}>
        {editDialogOpenRef.current = !!editDialogEntry}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDialogEntry?.groupName}</DialogTitle>
          </DialogHeader>
          {editDialogEntry && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm text-gray-600">備考</div>
                <textarea
                  value={editingEntryNote}
                  onChange={(e) => setEditingEntryNote(e.target.value)}
                  className="w-full min-h-24 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="entrance-se"
                    checked={!!entranceSEEnabled.get(editDialogEntry.entry.id)}
                    onCheckedChange={(v) => setEntranceSEEnabled(prev => new Map(prev.set(editDialogEntry.entry.id, !!v)))}
                  />
                  <Label htmlFor="entrance-se">入場SEを使用する</Label>
                </div>
                {!!entranceSEEnabled.get(editDialogEntry.entry.id) && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Music className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500 w-6">SE</span>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <SongTitleInput
                        value={entranceSETitle.get(editDialogEntry.entry.id) || ''}
                        onChange={(v) => setEntranceSETitle(prev => new Map(prev.set(editDialogEntry.entry.id, v)))}
                        onSelectSuggestion={({ title, artist }) => {
                          setEntranceSETitle(prev => new Map(prev.set(editDialogEntry.entry.id, title)))
                          setEntranceSEArtist(prev => new Map(prev.set(editDialogEntry.entry.id, artist)))
                        }}
                        placeholder="曲名"
                        limit={20}
                      />
                      <Input
                        value={entranceSEArtist.get(editDialogEntry.entry.id) || ''}
                        onChange={(e) => setEntranceSEArtist(prev => new Map(prev.set(editDialogEntry.entry.id, e.target.value)))}
                        placeholder="アーティスト名"
                      />
                    </div>
                  </div>
                )}
                {(editingItems.get(editDialogEntry.entry.id) || []).map((setlistItem, index) => (
                  <div key={setlistItem.id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Music className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <SongTitleInput
                        value={setlistItem.title}
                        onChange={(v) => handleUpdateItem(editDialogEntry.entry.id, setlistItem.id, 'title', v)}
                        onSelectSuggestion={({ title, artist }) => {
                          handleUpdateItem(editDialogEntry.entry.id, setlistItem.id, 'title', title)
                          handleUpdateItem(editDialogEntry.entry.id, setlistItem.id, 'artist', artist)
                        }}
                        placeholder="曲名"
                        limit={20}
                      />
                      <Input
                        value={setlistItem.artist || ''}
                        onChange={(e) => handleUpdateItem(editDialogEntry.entry.id, setlistItem.id, 'artist', e.target.value)}
                        placeholder="アーティスト名"
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(editDialogEntry.entry.id, setlistItem.id)} className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => handleAddItem(editDialogEntry.entry.id)} disabled={!!submitting.get(editDialogEntry.entry.id) || !dialogAccepting || ((editingItems.get(editDialogEntry.entry.id) || []).length >= (dialogSongLimit ?? Number.MAX_SAFE_INTEGER))}>
                  <Plus className="mr-2 h-4 w-4" />
                  曲を追加
                </Button>
                <LoadingButton
                  onClick={async () => {
                    if (editDialogEntry) {
                      const entryId = editDialogEntry.entry.id
                      const currentNote = editDialogEntry.entry.note || ''
                      if (editingEntryNote !== currentNote) {
                        await apiClient.updateEntry(entryId, { note: editingEntryNote || null })
                      }
                      await handleSave(entryId)
                      setEditDialogEntry(null)
                    }
                  }}
                  isLoading={!!submitting.get(editDialogEntry.entry.id)}
                  disabled={!dialogAccepting}
                >
                  保存
                </LoadingButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={
      <>
        <PageHeader />
        <div className="p-4 pt-0 mx-auto space-y-4">
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
        </div>
      </>
    }>
      <SetlistContent />
    </Suspense>
  )
}
