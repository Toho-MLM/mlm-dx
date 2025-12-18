import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Event } from "@/app/types"
import { Button } from "@/components/ui/button"
import { MoreVertical, Users } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EventEntryDialog } from "@/components/event-entry-dialog"
import Link from 'next/link'
import { Badge } from "@/components/ui/badge"
import { Music } from 'lucide-react'
import { useEventContext } from './event-context'

interface EventCardProps {
  event: Event
}

function Countdown({ targetDate, isAccepting }: { targetDate: string; isAccepting: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [, setForceUpdate] = useState(0)

  useEffect(() => {
    setMounted(true)
    
    const interval = setInterval(() => {
      setForceUpdate(prev => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [targetDate])

  function calculateTimeRemaining(target: Date): { text: string; color: string } {
    const now = new Date()
    const diff = target.getTime() - now.getTime()

    if (!isAccepting) {
      return { text: '受付終了', color: 'text-red-600 font-bold' }
    }

    if (diff <= 0) {
      return { text: '期限切れ', color: 'text-red-600 font-bold' }
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    let text = ''
    if (days > 0) {
      text = `${days}日${hours}時間${minutes}分${seconds}秒`
    } else if (hours > 0) {
      text = `${hours}時間${minutes}分${seconds}秒`
    } else if (minutes > 0) {
      text = `${minutes}分${seconds}秒`
    } else {
      text = `${seconds}秒`
    }

    let color = ''
    if (days >= 7) {
      color = 'text-blue-600'
    } else if (days >= 3) {
      color = 'text-green-600'
    } else if (days >= 1) {
      color = 'text-yellow-600'
    } else if (hours >= 6) {
      color = 'text-orange-500'
    } else if (hours >= 1) {
      color = 'text-orange-600'
    } else {
      color = 'text-red-500'
    }

    return { text, color }
  }

  if (!mounted) {
    return <Skeleton className="h-4 w-24" />
  }

  const { text, color } = calculateTimeRemaining(new Date(targetDate))

  return (
    <span className={`${color} text-sm`}>
      {text}
    </span>
  )
}
export function EventCard({ event }: EventCardProps) {
  const ctx = useEventContext()
  const groupOptions = ctx?.groupOptions ?? []
  const userEntries = ctx?.userEntries ?? []
  const loading = ctx?.loadingEntries ?? false
  const onEntriesChanged = ctx?.onEntriesChanged
  const onEdit = ctx?.onEdit
  const onDelete = ctx?.onDelete
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false)
  
  const userEntryIds = useMemo(() => {
    const eventEntries = userEntries.filter(e => e.event_id === event.id)
    return eventEntries.map(e => e.id)
  }, [userEntries, event.id])
  
  const groupLimit = event.group_limit ?? 2
  
  const enteredGroups = useMemo(() => {
    if (groupLimit === 0) {
      return groupOptions.filter(g => g.is_main).map(g => g.name)
    }
    const groupMap = new Map(groupOptions.map(g => [g.id, g.name]))
    const eventEntries = userEntries.filter(e => e.event_id === event.id)
    return eventEntries
      .map(entry => groupMap.get(entry.group_id))
      .filter((name): name is string => name !== undefined)
  }, [groupLimit, groupOptions, userEntries, event.id])
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDeadlineDate = (dateString: string) => {
    const date = new Date(dateString);
    date.setDate(date.getDate() - 1);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleEntrySuccess = () => {
    onEntriesChanged?.()
  }

  return (
    <Card className="w-full max-w-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02] mx-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          {loading ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <CardTitle className="text-xl font-bold text-gray-900">{event.title}</CardTitle>
          )}
          {(onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-gray-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem 
                    onClick={() => onEdit(event.id)}
                    className="flex items-center gap-2"
                  >
                    編集
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem 
                    onClick={() => onDelete(event.id)}
                    className="flex items-center gap-2 text-red-600"
                  >
                    削除
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 mb-1">イベント日</div>
            {loading ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <div className="text-base font-semibold text-gray-900">
                {formatDate(event.event_date)}
              </div>
            )}
          </div>

          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 mb-1">出場締切</div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900">
                    {formatDeadlineDate(event.entry_deadline)}
                  </div>
                  <Countdown targetDate={event.entry_deadline} isAccepting={event.is_entry_accepting} />
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 mb-1">セットリスト締切</div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900">
                    {formatDeadlineDate(event.setlist_deadline)}
                  </div>
                  <Countdown targetDate={event.setlist_deadline} isAccepting={event.is_setlist_accepting} />
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 mb-2">
              {groupLimit === 0 ? '本バンド' : '参加登録済'}
            </div>
            {loading ? (
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-20" />
              </div>
            ) : enteredGroups.length === 0 ? (
              <div className="text-sm text-gray-400">
                {groupLimit === 0 ? '本バンド未登録' : '未登録'}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {enteredGroups.map((groupName, index) => (
                  <Badge key={index} variant="secondary">
                    {groupName}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {groupLimit > 0 && (
            <div className="mt-4">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsEntryDialogOpen(true)}
                    disabled={!event.is_entry_accepting}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    参加登録
                  </Button>
                  {userEntryIds.length > 0 && (
                    <Link href={`/event/setlist?eventId=${event.id}`} className="w-full">
                      <Button variant="outline" className="w-full mt-2">
                        <Music className="mr-2 h-4 w-4" />
                        セットリスト管理
                      </Button>
                    </Link>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <EventEntryDialog
        event={event}
        isOpen={isEntryDialogOpen}
        onClose={() => setIsEntryDialogOpen(false)}
        onSuccess={handleEntrySuccess}
      />
      {/* セットリストはページに移行 */}
    </Card>
  )
}

