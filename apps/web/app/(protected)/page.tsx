'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ListChecks,
  RefreshCw,
} from 'lucide-react'
import type {
  DashboardAdminAction,
  DashboardData,
  DashboardMemberAction,
  DashboardScheduleItem,
} from '@shared-schemas'
import { isAdmin } from '@shared-schemas'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/app/context/AuthContext'
import { PageHeader } from '@/components/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
})

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function formatDeadline(value: string) {
  return dateTimeFormatter.format(new Date(new Date(value).getTime() - 1))
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2 text-foreground">{icon}</div>
          <div className="min-w-0">
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
      <CheckCircle2 className="h-6 w-6 text-green-600" />
      <p>{children}</p>
    </div>
  )
}

function ItemCard({
  badge,
  title,
  description,
  dateLabel,
  href,
  actionLabel,
}: {
  badge: ReactNode
  title: string
  description: string
  dateLabel: string
  href: string
  actionLabel: string
}) {
  return (
    <div className="rounded-lg border bg-background p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            <h3 className="truncate font-semibold">{title}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {dateLabel}
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
          <Link href={href}>
            {actionLabel}
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  )
}

function MemberActionItem({ action }: { action: DashboardMemberAction }) {
  if (action.kind === 'ENTRY_AVAILABLE') {
    return (
      <ItemCard
        badge={<Badge>参加受付</Badge>}
        title={action.event_title}
        description={`参加登録を検討できる所属バンドが${action.eligible_group_count}件あります。`}
        dateLabel={`出演締切 ${formatDeadline(action.due_at)}`}
        href="/event"
        actionLabel="参加登録へ"
      />
    )
  }

  return (
    <ItemCard
      badge={<Badge variant="secondary">セットリスト</Badge>}
      title={action.event_title}
      description={`${action.group_name} の曲目がまだ登録されていません。`}
      dateLabel={`登録締切 ${formatDeadline(action.due_at)}`}
      href={`/event/setlist?eventId=${action.event_id}`}
      actionLabel="曲目を登録"
    />
  )
}

function AdminActionItem({ action }: { action: DashboardAdminAction }) {
  if (action.kind === 'TIMELINE_INCOMPLETE') {
    return (
      <ItemCard
        badge={<Badge variant="outline">時間未設定</Badge>}
        title={action.event_title}
        description={`${action.missing_count}件の出演枠で、出演順または開始・終了時刻が未設定です。`}
        dateLabel={`開催日 ${dateFormatter.format(new Date(action.event_date))}`}
        href={`/event/timeline?eventId=${action.event_id}`}
        actionLabel="時間を設定"
      />
    )
  }

  const isEntry = action.kind === 'ENTRY_ACCEPTING_AFTER_DEADLINE'
  return (
    <ItemCard
      badge={<Badge variant="destructive">受付終了漏れ</Badge>}
      title={action.event_title}
      description={`${isEntry ? '出演' : 'セットリスト'}締切を過ぎていますが、受付中のままです。`}
      dateLabel={`締切 ${formatDeadline(action.due_at)}`}
      href="/event"
      actionLabel="イベント設定へ"
    />
  )
}

function ScheduleItem({ item }: { item: DashboardScheduleItem }) {
  if (item.kind === 'HALL_RESERVATION' || item.kind === 'EXTERNAL_RESERVATION') {
    const isHall = item.kind === 'HALL_RESERVATION'
    return (
      <ItemCard
        badge={<Badge variant={item.state === 'CONFIRMED' ? 'secondary' : 'outline'}>{isHall ? 'ホール予約' : '外部予約'}</Badge>}
        title={item.title}
        description={item.state === 'CONFIRMED' ? '予約確定' : '予約保留中'}
        dateLabel={`${formatDateTime(item.start_at)} 〜 ${formatDateTime(item.end_at)}`}
        href={isHall ? '/reservation' : '/reservation/external'}
        actionLabel="予約を確認"
      />
    )
  }

  const isEntry = item.kind === 'ENTRY_DEADLINE'
  return (
    <ItemCard
      badge={<Badge variant="outline">{isEntry ? '出演締切' : 'セットリスト締切'}</Badge>}
      title={item.event_title}
      description={isEntry ? 'イベントの参加登録締切が近づいています。' : 'セットリストの登録締切が近づいています。'}
      dateLabel={formatDeadline(item.due_at)}
      href={isEntry ? '/event' : `/event/setlist?eventId=${item.event_id}`}
      actionLabel="詳細を見る"
    />
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map((section) => (
        <Card key={section}>
          <CardHeader>
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1].map((item) => <Skeleton key={item} className="h-32 w-full" />)}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getDashboard()
      if (!response.success || !response.data) {
        throw new Error(response.error || 'ダッシュボードを取得できませんでした')
      }
      setData(response.data)
    } catch (loadError) {
      console.error('Failed to load dashboard:', loadError)
      setError('ダッシュボードを読み込めませんでした。時間をおいて再度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const isUserAdmin = isAdmin(user?.role)

  return (
    <>
      <PageHeader />
      <main className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-4">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-lg">
          <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <CalendarDays className="h-4 w-4" />
              今後14日間
            </div>
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                {user?.nickname || user?.name ? `${user.nickname || user.name}さん、おかえりなさい` : 'ダッシュボード'}
              </h1>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>読み込みに失敗しました</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadDashboard}>
                <RefreshCw />
                再読み込み
              </Button>
            </AlertDescription>
          </Alert>
        ) : data ? (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <SectionCard
              title="あなたの要対応"
              icon={<ClipboardCheck className="h-5 w-5" />}
            >
              {data.member_actions.length === 0 ? (
                <EmptyState>現在、対応が必要な項目はありません。</EmptyState>
              ) : (
                <div className="space-y-3">
                  {data.member_actions.map((action) => (
                    <MemberActionItem
                      key={`${action.kind}-${action.event_id}-${action.kind === 'SETLIST_EMPTY' ? action.group_id : 'event'}`}
                      action={action}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {isUserAdmin && (
              <SectionCard
                title="管理者向け確認"
                icon={<ListChecks className="h-5 w-5" />}
              >
                {data.admin_actions.length === 0 ? (
                  <EmptyState>現在、確認が必要な設定はありません。</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {data.admin_actions.map((action) => (
                      <AdminActionItem key={`${action.kind}-${action.event_id}`} action={action} />
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            <div className={isUserAdmin ? 'lg:col-span-2' : ''}>
              <SectionCard
                title="直近の予定"
                icon={<CalendarClock className="h-5 w-5" />}
              >
                {data.schedule_items.length === 0 ? (
                  <EmptyState>今後14日間の予定はありません。</EmptyState>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {data.schedule_items.map((item) => (
                      <ScheduleItem
                        key={`${item.kind}-${item.kind === 'HALL_RESERVATION' || item.kind === 'EXTERNAL_RESERVATION' ? item.reservation_id : item.event_id}`}
                        item={item}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        ) : null}
      </main>
    </>
  )
}
