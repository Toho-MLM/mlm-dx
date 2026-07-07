"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Plus, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { apiClient, type BandDraftMember, type BandDraftState } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Instrument, instrumentNames } from '@/app/types'

const instruments = [Instrument.vocal, Instrument.guitar, Instrument.keyboard, Instrument.drums, Instrument.bass]
const instrumentTone: Record<Instrument, string> = {
  [Instrument.vocal]: 'border-blue-200 bg-blue-50 text-black',
  [Instrument.guitar]: 'border-emerald-200 bg-emerald-50 text-black',
  [Instrument.keyboard]: 'border-violet-200 bg-violet-50 text-black',
  [Instrument.drums]: 'border-amber-200 bg-amber-50 text-black',
  [Instrument.bass]: 'border-rose-200 bg-rose-50 text-black',
}
const instrumentChipColor: Record<string, { bg: string; border: string; text: string }> = {
  VO: { bg: '#dbeafe', border: '#bfdbfe', text: '#111827' },
  GT: { bg: '#d1fae5', border: '#a7f3d0', text: '#111827' },
  KEY: { bg: '#ede9fe', border: '#ddd6fe', text: '#111827' },
  DR: { bg: '#fef3c7', border: '#fde68a', text: '#111827' },
  BA: { bg: '#ffe4e6', border: '#fecdd3', text: '#111827' },
}

type SocketStatus = 'connecting' | 'open' | 'closed'

type ServerMessage =
  | { type: 'snapshot'; state: BandDraftState }
  | { type: 'error'; error: string }

export function BandMainDraftBoard({ token }: { token: string }) {
  const router = useRouter()
  const [state, setState] = useState<BandDraftState | null>(null)
  const [members, setMembers] = useState<BandDraftMember[]>([])
  const [canFinalize, setCanFinalize] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting')
  const [touchDrag, setTouchDrag] = useState<{ memberId: string; x: number; y: number } | null>(null)
  const [trayHeight, setTrayHeight] = useState(getDefaultTrayHeight)
  const [trayBounds, setTrayBounds] = useState(getDefaultTrayHeightBounds)
  const [isResizingTray, setIsResizingTray] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const tableCardRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const memberMap = useMemo(() => {
    return new Map(members.map((member) => [member.id, member]))
  }, [members])
  const isEditable = socketStatus === 'open'
  const touchDragMember = touchDrag ? memberMap.get(touchDrag.memberId) : undefined
  const clampedTrayHeight = clampTrayHeight(trayHeight, trayBounds)

  const loadDraft = useCallback(async () => {
    try {
      setLoading(true)
      const response = await apiClient.getBandMainDraft(token)
      if (!response.success || !response.data) {
        toast.error('本バンド決めを取得できませんでした')
        return
      }
      setState(response.data.state)
      setMembers(response.data.members)
      setCanFinalize(response.data.canFinalize)
      setCanDelete(response.data.canDelete)
    } catch (error) {
      toast.error('本バンド決めを取得できませんでした', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  useEffect(() => {
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      setSocketStatus('connecting')

      const socket = new WebSocket(apiClient.getBandMainDraftWebSocketUrl(token))
      socketRef.current = socket

      socket.onopen = () => setSocketStatus('open')
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.type === 'snapshot') {
          setState(message.state)
          return
        }
        if (message.type === 'error') {
          toast.error('同期に失敗しました', { description: message.error })
        }
      }
      socket.onclose = () => {
        if (cancelled) return
        setSocketStatus('closed')
        reconnectTimerRef.current = setTimeout(connect, 1500)
      }
      socket.onerror = () => {
        setSocketStatus('closed')
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [token])

  const publish = useCallback((nextState: BandDraftState) => {
    setState(nextState)
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'replace_state', state: nextState }))
    } else {
      toast.error('WebSocketが未接続です')
    }
  }, [])

  const removeMemberFromState = useCallback((draftState: BandDraftState, memberId: string): BandDraftState => {
    const cells = cloneCells(draftState.cells)
    for (const column of draftState.columns) {
      for (const instrument of instruments) {
        cells[column.id][instrument] = (cells[column.id][instrument] ?? []).filter((id) => id !== memberId)
      }
    }

    return {
      ...draftState,
      cells,
      unassignedMemberIds: draftState.unassignedMemberIds.filter((id) => id !== memberId),
    }
  }, [])

  const moveMemberToCell = useCallback((memberId: string, columnId: string, instrument: Instrument) => {
    if (!state || !isEditable) return

    const base = removeMemberFromState(state, memberId)
    const cells = cloneCells(base.cells)
    cells[columnId][instrument] = [...(cells[columnId][instrument] ?? []), memberId]
    publish({ ...base, cells })
  }, [isEditable, publish, removeMemberFromState, state])

  const moveMemberToUnassigned = useCallback((memberId: string) => {
    if (!state || !isEditable) return

    const base = removeMemberFromState(state, memberId)
    publish({
      ...base,
      unassignedMemberIds: [...base.unassignedMemberIds, memberId],
    })
  }, [isEditable, publish, removeMemberFromState, state])

  const addColumn = useCallback(() => {
    if (!state || !isEditable) return

    const columnId = crypto.randomUUID()
    const cells = cloneCells(state.cells)
    cells[columnId] = {}
    for (const instrument of instruments) {
      cells[columnId][instrument] = []
    }

    publish({
      ...state,
      columns: [...state.columns, { id: columnId, name: `バンド${state.columns.length + 1}` }],
      cells,
    })
  }, [isEditable, publish, state])

  const removeColumn = useCallback((columnId: string) => {
    if (!state || !isEditable || state.columns.length <= 1) return

    const returningMemberIds = instruments.flatMap((instrument) => state.cells[columnId]?.[instrument] ?? [])
    const cells = cloneCells(state.cells)
    delete cells[columnId]

    publish({
      ...state,
      columns: state.columns.filter((column) => column.id !== columnId),
      cells,
      unassignedMemberIds: [...state.unassignedMemberIds, ...returningMemberIds],
    })
  }, [isEditable, publish, state])

  const handleDrop = useCallback((event: ReactDragEvent, columnId: string, instrument: Instrument) => {
    event.preventDefault()
    if (!isEditable) return
    const memberId = event.dataTransfer.getData('text/plain')
    if (memberId) {
      moveMemberToCell(memberId, columnId, instrument)
    }
  }, [isEditable, moveMemberToCell])

  const finishTouchDrag = useCallback((memberId: string, x: number, y: number) => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-target]')
    if (!target) return

    if (target.dataset.dropTarget === 'cell') {
      const columnId = target.dataset.columnId
      const instrument = target.dataset.instrument as Instrument | undefined
      if (columnId && instrument) {
        moveMemberToCell(memberId, columnId, instrument)
      }
      return
    }

    if (target.dataset.dropTarget === 'unassigned') {
      moveMemberToUnassigned(memberId)
    }
  }, [moveMemberToCell, moveMemberToUnassigned])

  useEffect(() => {
    if (!touchDrag) return

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault()
      setTouchDrag((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)
    }

    const handlePointerUp = (event: PointerEvent) => {
      event.preventDefault()
      const current = touchDrag
      setTouchDrag(null)
      finishTouchDrag(current.memberId, event.clientX, event.clientY)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp, { passive: false, once: true })
    window.addEventListener('pointercancel', handlePointerUp, { passive: false, once: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [finishTouchDrag, touchDrag])

  useEffect(() => {
    const handleResize = () => {
      const nextBounds = getMeasuredTrayHeightBounds()
      setTrayBounds(nextBounds)
      setTrayHeight((current) => clampTrayHeight(current, nextBounds))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
    const nextBounds = getMeasuredTrayHeightBounds()
      setTrayBounds(nextBounds)
      setTrayHeight((current) => clampTrayHeight(current, nextBounds))
    })

    return () => window.cancelAnimationFrame(frame)
  }, [state?.columns.length, state?.unassignedMemberIds.length, loading])

  const handleTrayResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsResizingTray(true)
    const startY = event.clientY
    const startHeight = clampedTrayHeight
    const bounds = trayBounds

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      setTrayHeight(clampTrayHeight(startHeight + startY - moveEvent.clientY, bounds))
    }

    const handlePointerUp = () => {
      setIsResizingTray(false)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    window.addEventListener('pointercancel', handlePointerUp, { once: true })
  }, [clampedTrayHeight, trayBounds])

  const handleFinalize = useCallback(() => {
    startTransition(async () => {
      try {
        const response = await apiClient.finalizeBandMainDraft(token)
        if (response.success) {
          setIsConfirmOpen(false)
          toast.success('本バンドを作成しました', {
            description: `${response.data?.createdCount ?? 0}件作成しました`,
          })
          router.push('/band')
        } else {
          toast.error('確定できませんでした')
        }
      } catch (error) {
        toast.error('確定できませんでした', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    })
  }, [router, token])

  const handleDeleteDraft = useCallback(() => {
    startTransition(async () => {
      try {
        const response = await apiClient.deleteBandMainDraft(token)
        if (response.success) {
          setIsDeleteConfirmOpen(false)
          toast.success('本バンド決めを削除しました')
          router.push('/band')
        } else {
          toast.error('削除できませんでした')
        }
      } catch (error) {
        toast.error('削除できませんでした', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    })
  }, [router, token])

  const copyShareUrl = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href)
    toast.success('共有URLをコピーしました')
  }, [])

  const rightActions = (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="hidden gap-1 text-black sm:flex">
        {socketStatus === 'open' ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {socketStatus === 'open' ? '同期中' : '再接続中'}
      </Badge>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={copyShareUrl}>
              <Copy className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>共有URLをコピー</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {canFinalize && (
        <Button size="sm" onClick={() => setIsConfirmOpen(true)} disabled={isPending}>
          <Check className="h-4 w-4" />
          確定
        </Button>
      )}
      {canDelete && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => setIsDeleteConfirmOpen(true)} disabled={isPending}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>セッションを削除</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )

  if (loading || !state) {
    return (
      <>
        <PageHeader rightActions={rightActions} />
        <div className="p-3 sm:p-4">
          <Card className="rounded-lg shadow-sm">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[420px] w-full" />
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader rightActions={rightActions} />
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>本バンドを確定しますか？</DialogTitle>
            <DialogDescription>
              現在の表の内容から本バンドを作成します。確定後、このドラフトは削除されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={isPending}>
              キャンセル
            </Button>
            <Button onClick={handleFinalize} disabled={isPending}>
              <Check className="h-4 w-4" />
              確定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>セッションを削除しますか？</DialogTitle>
            <DialogDescription>
              この本バンド決めセッションを削除します。共有URLからも開けなくなります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)} disabled={isPending}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteDraft} disabled={isPending}>
              <Trash2 className="h-4 w-4" />
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex h-[calc(100dvh-64px)] min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
          <Card ref={tableCardRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg shadow-sm">
            <CardContent className="min-h-0 min-w-0 flex-1 p-0">
              <ScrollArea className="h-full w-full whitespace-nowrap">
                <table className="min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="sticky left-0 z-[2] w-32 border-r bg-muted/80 p-3 text-left font-medium text-muted-foreground backdrop-blur">
                        楽器
                      </th>
                      {state.columns.map((column) => (
                        <th key={column.id} className="w-36 border-r p-2 align-middle last:border-r-0">
                          <div className="flex h-9 items-center justify-between gap-2 rounded-md px-2">
                            <span className="truncate font-semibold text-foreground">{column.name}</span>
                            {state.columns.length > 1 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground"
                                      onClick={() => removeColumn(column.id)}
                                      disabled={!isEditable}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>列を削除</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="w-32 p-2 align-middle">
                        <Button variant="outline" size="sm" onClick={addColumn} disabled={!isEditable}>
                          <Plus className="h-4 w-4" />
                          列追加
                        </Button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {instruments.map((instrument) => (
                      <tr key={instrument} className="border-b last:border-b-0">
                        <th className="sticky left-0 z-[1] w-32 border-r bg-card p-3 text-left align-top backdrop-blur">
                          <Badge variant="outline" className={cn('rounded-md border font-medium', instrumentTone[instrument])}>
                            {instrumentNames[instrument]}
                          </Badge>
                        </th>
                        {state.columns.map((column) => {
                          const memberIds = state.cells[column.id]?.[instrument] ?? []
                          return (
                            <td
                              key={`${column.id}-${instrument}`}
                              data-drop-target="cell"
                              data-column-id={column.id}
                              data-instrument={instrument}
                              className="h-28 w-36 border-r bg-background p-2 align-top last:border-r-0"
                              onDragOver={(event) => {
                                if (isEditable) event.preventDefault()
                              }}
                              onDrop={(event) => handleDrop(event, column.id, instrument)}
                            >
                              <div
                                className={cn(
                                  'flex min-h-24 flex-col gap-1.5 rounded-md border border-dashed border-transparent p-1 transition-colors',
                                  isEditable && 'hover:border-border hover:bg-muted/40',
                                  memberIds.length === 0 && 'border-border/60'
                                )}
                              >
                                {memberIds.map((memberId) => (
                                  <MemberChip
                                    key={memberId}
                                    member={memberMap.get(memberId)}
                                    disabled={!isEditable}
                                    onReturn={() => moveMemberToUnassigned(memberId)}
                                    onTouchDragStart={(x, y) => setTouchDrag({ memberId, x, y })}
                                    compact
                                  />
                                ))}
                              </div>
                            </td>
                          )
                        })}
                        <td className="w-32 bg-background p-2 align-top" />
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
          <div
            data-drop-target="unassigned"
            className="mt-3 flex-none"
            onDragOver={(event) => {
              if (isEditable) event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (!isEditable) return
              const memberId = event.dataTransfer.getData('text/plain')
              if (memberId) moveMemberToUnassigned(memberId)
            }}
          >
            <div
              className="relative w-full rounded-lg border bg-background p-3 shadow-sm"
              style={{ height: clampedTrayHeight }}
            >
              <button
                type="button"
                className={cn(
                  'absolute left-1/2 top-0 flex h-8 w-40 -translate-x-1/2 cursor-row-resize items-center justify-center bg-transparent sm:h-4 sm:w-24',
                  'after:block after:h-1 after:w-10 after:rounded-full after:bg-muted-foreground/35 after:transition-colors hover:after:bg-muted-foreground/55',
                  isResizingTray && 'after:bg-muted-foreground/60'
                )}
                onPointerDown={handleTrayResizeStart}
                aria-label="未配置エリアの高さを調整"
              />
              <div className="mb-2 mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">未配置</span>
                  <Badge variant="secondary" className="rounded-md text-black">{state.unassignedMemberIds.length}</Badge>
                </div>
                {socketStatus !== 'open' && (
                  <Badge variant="outline" className="rounded-md text-black">再接続中</Badge>
                )}
              </div>
              <div
                className="flex flex-wrap content-start gap-2 overflow-y-auto rounded-md border p-2"
                style={{ maxHeight: clampedTrayHeight - 76 }}
              >
                {state.unassignedMemberIds.map((memberId) => (
                  <MemberChip
                    key={memberId}
                    member={memberMap.get(memberId)}
                    disabled={!isEditable}
                    onReturn={undefined}
                    onTouchDragStart={(x, y) => setTouchDrag({ memberId, x, y })}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        {touchDrag && touchDragMember && (
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1.5 text-sm font-medium shadow-lg"
            style={{
              left: touchDrag.x,
              top: touchDrag.y,
              ...getMemberChipStyle(touchDragMember),
            }}
          >
            {touchDragMember.name}
          </div>
        )}
      </div>
    </>
  )
}

function MemberChip({ member, disabled, onReturn, onTouchDragStart, compact = false }: { member?: BandDraftMember; disabled: boolean; onReturn?: () => void; onTouchDragStart?: (x: number, y: number) => void; compact?: boolean }) {
  if (!member) return null
  const style = getMemberChipStyle(member)

  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', member.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onPointerDown={(event) => {
        if (disabled || event.pointerType === 'mouse') return
        event.preventDefault()
        onTouchDragStart?.(event.clientX, event.clientY)
      }}
      style={style}
      className={cn(
        'inline-flex h-9 max-w-full touch-none select-none items-center gap-1 rounded-md border px-2 text-sm font-medium shadow-sm transition-[box-shadow,transform,opacity]',
        compact && 'w-full',
        !disabled && 'cursor-grab hover:shadow-md active:cursor-grabbing active:scale-[0.98]',
        disabled && 'opacity-70'
      )}
    >
      {onReturn && !disabled && (
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onReturn}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
      <span className="truncate">{member.name}</span>
    </div>
  )
}

function getMemberChipStyle(member: BandDraftMember): CSSProperties {
  const colors = member.instruments
    .map((instrument) => instrumentChipColor[instrument])
    .filter((color): color is { bg: string; border: string; text: string } => Boolean(color))

  if (colors.length === 0) {
    return {
      background: 'hsl(var(--background))',
      borderColor: 'hsl(var(--border))',
      color: '#111827',
    }
  }

  if (colors.length === 1) {
    return {
      background: colors[0].bg,
      borderColor: colors[0].border,
      color: colors[0].text,
    }
  }

  const step = 100 / colors.length
  const stops = colors.flatMap((color, index) => {
    const start = Math.round(index * step)
    const end = Math.round((index + 1) * step)
    return [`${color.bg} ${start}%`, `${color.bg} ${end}%`]
  })

  return {
    background: `linear-gradient(135deg, ${stops.join(', ')})`,
    borderColor: colors[0].border,
    color: '#111827',
  }
}

type TrayHeightBounds = { min: number; max: number }

function clampTrayHeight(height: number, bounds: TrayHeightBounds = getDefaultTrayHeightBounds()): number {
  return Math.max(bounds.min, Math.min(bounds.max, height))
}

function getDefaultTrayHeight(): number {
  if (typeof window === 'undefined') return 176
  const bounds = getDefaultTrayHeightBounds()
  return clampTrayHeight(window.innerWidth >= 768 ? 220 : 152, bounds)
}

function getDefaultTrayHeightBounds(): TrayHeightBounds {
  if (typeof window === 'undefined') {
    return { min: 128, max: 320 }
  }

  const isDesktop = window.innerWidth >= 768
  const min = isDesktop ? 144 : 112
  const fallbackMax = Math.floor(window.innerHeight * (isDesktop ? 0.34 : 0.38))
  const max = Math.max(min, fallbackMax)

  return { min, max }
}

function getMeasuredTrayHeightBounds(): TrayHeightBounds {
  const fallback = getDefaultTrayHeightBounds()
  return fallback
}

function cloneCells(cells: BandDraftState['cells']): BandDraftState['cells'] {
  return Object.fromEntries(
    Object.entries(cells).map(([columnId, columnCells]) => [
      columnId,
      Object.fromEntries(
        Object.entries(columnCells).map(([instrument, memberIds]) => [instrument, [...memberIds]])
      ),
    ])
  )
}
