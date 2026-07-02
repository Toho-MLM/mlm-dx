"use client"

import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Group, instrumentColors, instrumentNames, instrumentOrder } from '@/app/types'
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

export default function BandMainPage() {
  const [bands, setBands] = useState<Group[]>([])
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)

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

  const rows = useMemo(() => {
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
      ) as Record<string, string[]>,
    }))
  }, [bands, memberNameById])

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
          <div className="overflow-hidden rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-36 font-semibold text-foreground">バンド</TableHead>
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
                  <TableRow key={band.id}>
                    <TableCell className="whitespace-nowrap font-medium">{band.name}</TableCell>
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
