"use client"

import { useEffect, useMemo, useState } from 'react'
import { Download, GripVertical } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Group, Instrument, instrumentColors, instrumentNames, instrumentOrder } from '@/app/types'
import { apiClient } from '@/lib/api'
import { formatGroups } from '@/lib/utils'

type MemberOption = {
  id: string
  name: string
  display_name?: string
  real_name?: string
  instruments: string[]
}

const stripStudentNumberPrefix = (name: string) => name.replace(/^[A-Z0-9]{6}\s+/, '')

type MainBandRow = {
  band: Group
  cells: Record<Instrument, string[]>
}

const canvasInstrumentColors: Record<Instrument, { background: string; text: string }> = {
  [Instrument.vocal]: { background: '#dbeafe', text: '#1e40af' },
  [Instrument.guitar]: { background: '#dcfce7', text: '#166534' },
  [Instrument.keyboard]: { background: '#f3e8ff', text: '#6b21a8' },
  [Instrument.drums]: { background: '#fef9c3', text: '#854d0e' },
  [Instrument.bass]: { background: '#fee2e2', text: '#991b1b' },
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''

  for (const char of text) {
    const nextLine = line + char
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line)
      line = char
    } else {
      line = nextLine
    }
  }

  if (line) lines.push(line)
  return lines
}

function downloadRowsAsPng(rows: MainBandRow[]) {
  const scale = 2
  const bandColumnWidth = 180
  const instrumentColumnWidth = 180
  const headerHeight = 56
  const paddingX = 16
  const paddingY = 12
  const lineHeight = 22
  const minRowHeight = 54
  const tableWidth = bandColumnWidth + instrumentOrder.length * instrumentColumnWidth

  const measureCanvas = document.createElement('canvas')
  const measureContext = measureCanvas.getContext('2d')
  if (!measureContext) return

  measureContext.font = '14px sans-serif'
  const rowHeights = rows.map(({ band, cells }) => {
    const bandLines = wrapCanvasText(measureContext, band.name, bandColumnWidth - paddingX * 2)
    const maxCellLines = Math.max(
      1,
      ...instrumentOrder.map(instrument => {
        const names = cells[instrument]
        if (names.length === 0) return 1
        return names.flatMap(name => wrapCanvasText(measureContext, name, instrumentColumnWidth - paddingX * 2)).length
      })
    )
    return Math.max(minRowHeight, paddingY * 2 + Math.max(bandLines.length, maxCellLines) * lineHeight)
  })
  const tableHeight = headerHeight + rowHeights.reduce((sum, height) => sum + height, 0)

  const canvas = document.createElement('canvas')
  canvas.width = tableWidth * scale
  canvas.height = tableHeight * scale
  const context = canvas.getContext('2d')
  if (!context) return

  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, tableWidth, tableHeight)

  context.strokeStyle = '#e5e7eb'
  context.lineWidth = 1
  context.fillStyle = '#f9fafb'
  context.fillRect(0, 0, tableWidth, headerHeight)

  context.font = '600 14px sans-serif'
  context.fillStyle = '#111827'
  context.textBaseline = 'middle'
  context.fillText('バンド', paddingX, headerHeight / 2)

  let x = bandColumnWidth
  instrumentOrder.forEach(instrument => {
    const color = canvasInstrumentColors[instrument]
    const label = instrumentNames[instrument]
    const badgeWidth = Math.ceil(context.measureText(label).width) + 20
    context.fillStyle = color.background
    context.beginPath()
    context.roundRect(x + paddingX, (headerHeight - 28) / 2, badgeWidth, 28, 6)
    context.fill()
    context.fillStyle = color.text
    context.fillText(label, x + paddingX + 10, headerHeight / 2)
    x += instrumentColumnWidth
  })

  context.strokeStyle = '#e5e7eb'
  for (let columnX = 0; columnX <= tableWidth; columnX += columnX === 0 ? bandColumnWidth : instrumentColumnWidth) {
    context.beginPath()
    context.moveTo(columnX, 0)
    context.lineTo(columnX, tableHeight)
    context.stroke()
  }

  let y = headerHeight
  rows.forEach(({ band, cells }, rowIndex) => {
    const rowHeight = rowHeights[rowIndex]
    context.strokeStyle = '#e5e7eb'
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(tableWidth, y)
    context.stroke()

    context.font = '600 14px sans-serif'
    context.fillStyle = '#111827'
    wrapCanvasText(context, band.name, bandColumnWidth - paddingX * 2).forEach((line, lineIndex) => {
      context.fillText(line, paddingX, y + paddingY + lineHeight / 2 + lineIndex * lineHeight)
    })

    context.font = '14px sans-serif'
    instrumentOrder.forEach((instrument, instrumentIndex) => {
      const names = cells[instrument]
      const cellX = bandColumnWidth + instrumentIndex * instrumentColumnWidth
      context.fillStyle = names.length > 0 ? '#111827' : '#9ca3af'

      const lines = names.length > 0
        ? names.flatMap(name => wrapCanvasText(context, name, instrumentColumnWidth - paddingX * 2))
        : ['-']

      lines.forEach((line, lineIndex) => {
        context.fillText(line, cellX + paddingX, y + paddingY + lineHeight / 2 + lineIndex * lineHeight)
      })
    })

    y += rowHeight
  })

  context.beginPath()
  context.moveTo(0, tableHeight - 0.5)
  context.lineTo(tableWidth, tableHeight - 0.5)
  context.stroke()

  const link = document.createElement('a')
  const date = new Date().toLocaleDateString('sv-SE')
  link.download = `main-band-${date}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export default function BandMainPage() {
  const [bands, setBands] = useState<Group[]>([])
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingBandId, setDraggingBandId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchMainBands() {
      try {
        setLoading(true)
        const [groupsRes, membersRes] = await Promise.all([
          apiClient.getMainGroups(),
          apiClient.getMemberOptions(),
        ])

        if (cancelled) return

        if (groupsRes.success) {
          setBands(formatGroups(groupsRes.data || []).filter(group => group.isMain && group.isActive))
        }
        if (membersRes.success) {
          setMemberOptions(membersRes.data || [])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchMainBands()

    return () => {
      cancelled = true
    }
  }, [])

  const memberNameById = useMemo(() => {
    return new Map(
      memberOptions.map(member => [
        member.id,
        stripStudentNumberPrefix(member.real_name || member.name),
      ])
    )
  }, [memberOptions])

  const rows = useMemo<MainBandRow[]>(() => {
    return bands.map(band => ({
      band,
      cells: Object.fromEntries(
        instrumentOrder.map(instrument => [
          instrument,
          band.assignments
            .filter(member => member.instruments.includes(instrument))
            .map(member => memberNameById.get(member.id) || `不明なメンバー (${member.id})`)
            .sort((a, b) => a.localeCompare(b, 'ja')),
        ])
      ) as Record<Instrument, string[]>,
    }))
  }, [bands, memberNameById])

  const handleRowDrop = (targetBandId: string) => {
    if (!draggingBandId || draggingBandId === targetBandId) return

    setBands(currentBands => {
      const fromIndex = currentBands.findIndex(band => band.id === draggingBandId)
      const toIndex = currentBands.findIndex(band => band.id === targetBandId)
      if (fromIndex === -1 || toIndex === -1) return currentBands
      return moveItem(currentBands, fromIndex, toIndex)
    })
    setDraggingBandId(null)
  }

  return (
    <>
      <PageHeader />
      <div className="p-3 sm:p-4">
        {loading ? (
          <MainBandTableSkeleton />
        ) : rows.length === 0 ? (
          <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">
            有効な本バンドがありません。
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                行をドラッグすると、この画面上だけで順序を変更できます。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadRowsAsPng(rows)}
              >
                <Download className="h-4 w-4" />
                画像として保存
              </Button>
            </div>
            <div className="overflow-hidden rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-44 font-semibold text-foreground">バンド</TableHead>
                  {instrumentOrder.map(instrument => (
                    <TableHead key={instrument} className="min-w-40 font-semibold text-foreground">
                      <Badge variant="outline" className={instrumentColors[instrument]}>
                        {instrumentNames[instrument]}
                      </Badge>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ band, cells }) => (
                  <TableRow
                    key={band.id}
                    draggable
                    onDragStart={(event) => {
                      setDraggingBandId(band.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', band.id)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      handleRowDrop(band.id)
                    }}
                    onDragEnd={() => setDraggingBandId(null)}
                    className={draggingBandId === band.id ? 'opacity-50' : undefined}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
                        <span>{band.name}</span>
                      </div>
                    </TableCell>
                    {instrumentOrder.map(instrument => (
                      <TableCell key={`${band.id}-${instrument}`} className="align-top">
                        {cells[instrument].length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {cells[instrument].map((name, index) => (
                              <span key={`${name}-${index}`} className="text-sm leading-5">
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function MainBandTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="min-w-36">
              <Skeleton className="h-5 w-16" />
            </TableHead>
            {instrumentOrder.map(instrument => (
              <TableHead key={instrument} className="min-w-40">
                <Skeleton className="h-6 w-20 rounded-md" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[0, 1, 2, 3].map(row => (
            <TableRow key={row}>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
              {instrumentOrder.map((instrument, index) => (
                <TableCell key={`${instrument}-${row}`} className="align-top">
                  <div className="space-y-1.5">
                    <Skeleton className={`h-4 ${index % 2 === 0 ? 'w-20' : 'w-28'}`} />
                    {row % 2 === 0 && <Skeleton className="h-4 w-16" />}
                  </div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
