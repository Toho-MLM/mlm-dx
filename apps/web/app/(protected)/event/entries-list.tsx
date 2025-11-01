'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Music, Users, FileText } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { Entry } from '@/app/types'
import { toast } from 'sonner'
import { Skeleton } from "@/components/ui/skeleton"

interface EntriesListProps {
  eventId: string
  eventTitle: string
}

export function EntriesList({ eventId, eventTitle }: EntriesListProps) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetchEntries()
  }, [eventId])

  const fetchEntries = async () => {
    try {
      setLoading(true)
      const [entriesResponse, groupsResponse] = await Promise.all([
        apiClient.getEntries(eventId),
        apiClient.getGroupOptions(),
      ])
      
      if (entriesResponse.success && entriesResponse.data) {
        setEntries(entriesResponse.data)
      }
      
      if (groupsResponse.success && groupsResponse.data) {
        const groupMap = new Map(groupsResponse.data.map(g => [g.id, g.name]))
        setGroups(groupMap)
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenSetlist = (entry: Entry) => {
    window.location.href = `/event/setlist?eventId=${eventId}`
  }

  const handleSetlistSuccess = () => {
    fetchEntries()
  }

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('このエントリーを削除しますか？')) return
    
    try {
      await apiClient.deleteEntry(entryId)
      toast.success('エントリーを削除しました')
      fetchEntries()
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast.error('エントリーの削除に失敗しました')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {eventTitle} - エントリー一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              まだエントリーがありません
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">
                      {groups.get(entry.group_id) || '不明なグループ'}
                    </Badge>
                    {entry.note && (
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <FileText className="h-4 w-4" />
                        <span>{entry.note}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenSetlist(entry)}
                      className="flex items-center gap-2"
                    >
                      <Music className="h-4 w-4" />
                      セットリスト
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      削除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* セットリストはページに移行 */}
    </>
  )
}

