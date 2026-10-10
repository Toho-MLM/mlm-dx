'use client'

import { useEffect, useRef, useState } from 'react'
import { ExecutiveRoleSchema, ExecutiveTransitionSchema, SaveExecutiveTransitionRequestSchema, type ExecutiveAssignment, type ExecutiveTransition } from '@shared-schemas'
import { MemberListItem, Role, roleNames } from '@/app/types'
import { apiClient } from '@/lib/api'
import { HttpError } from '@/lib/http-client'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { DraftDialog } from '@/components/draft-dialog'

type Draft = { date: string; roles: Record<string, string> }
const operationToastId = 'executive-transition-operation'
const validationToastId = 'executive-transition-validation'
const statuses = { PENDING: '交代予定', APPLIED: '交代済み', CANCELLED: '取消済み', FAILED: '交代停止' }
const errorLabels: Record<string, string> = {
  INVALID_EFFECTIVE_DATE: '交代日は明日以降を指定してください',
  MEMBER_UNAVAILABLE: '交代対象のメンバーが削除されたか、管理者に変更されています。最新のメンバーを確認してください',
  TRANSITION_CONFLICT: '交代予定が変更または実行されています。入力は保持しています。閉じて最新の予定を読み込んでください',
  INVALID_REQUEST_DATA: '交代日と交代後の幹部を確認してください',
}
const assignmentsFor = (draft: Draft): ExecutiveAssignment[] => Object.entries(draft.roles)
  .filter(([, role]) => role !== 'MBR')
  .map(([user_id, role]) => ({ user_id, role: ExecutiveRoleSchema.parse(role) }))
const assignmentsKey = (entries: ExecutiveAssignment[]) => JSON.stringify([...entries].sort((a, b) => a.user_id.localeCompare(b.user_id)))

export function ExecutiveTransitionDialog({ enabled, onApplied }: { enabled: boolean; onApplied: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [schedule, setSchedule] = useState<ExecutiveTransition | null>(null)
  const [draft, setDraft] = useState<Draft>({ date: '', roles: {} })
  const [search, setSearch] = useState('')
  const [confirmation, setConfirmation] = useState<'save' | 'cancel' | null>(null)
  const [uncertain, setUncertain] = useState<'save' | 'cancel' | null>(null)
  const [blocked, setBlocked] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    if (!open && !busy && restoreFocus.current) {
      triggerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
      restoreFocus.current = false
    }
  }, [open, busy])

  const reportError = (error: unknown) => {
    if (error instanceof HttpError) {
      toast.error(errorLabels[error.data?.error || ''] || error.message, { id: operationToastId })
      if (error.status === 409 || error.status === 401 || error.status === 403) setBlocked(true)
    } else {
      toast.error('通信結果を確認できませんでした。もう一度確認してください', { id: operationToastId })
    }
  }

  const start = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const [memberResponse, transitionResponse] = await Promise.all([apiClient.getMemberList(), apiClient.getExecutiveTransition()])
      if (!memberResponse.success || !memberResponse.data || !transitionResponse.success) throw new Error('LOAD_FAILED')
      const latest = transitionResponse.data ? ExecutiveTransitionSchema.parse(transitionResponse.data) : null
      const eligible = memberResponse.data.filter((member) => member.role !== 'ADM')
      const selected = new Map(latest?.status === 'PENDING' ? latest.assignments.map((entry) => [entry.user_id, entry.role]) : [])
      setMembers(eligible)
      setSchedule(latest)
      setDraft({
        date: latest?.status === 'PENDING' ? latest.effective_date : '',
        roles: Object.fromEntries(eligible.map((member) => [member.id,
          latest?.status === 'PENDING' ? selected.get(member.id) || 'MBR' : member.role])),
      })
      setSearch('')
      setConfirmation(null)
      setUncertain(null)
      setBlocked(false)
      restoreFocus.current = true
      setOpen(true)
      if (latest?.status === 'FAILED') toast.error('交代対象の削除または管理者への変更により、幹部交代を停止しました。役職は変更していません。設定を見直してください')
      if (latest?.status === 'PENDING' && latest.assignments.some((entry) => !eligible.some((member) => member.id === entry.user_id))) {
        toast.warning('予定に含まれるメンバーが削除されたか、管理者に変更されています。交代後の役職を選び直してください')
      }
    } catch (error) {
      reportError(error)
    } finally { setBusy(false); inFlight.current = false }
  }

  const prepareSave = () => {
    const request = SaveExecutiveTransitionRequestSchema.safeParse({
      effective_date: draft.date, assignments: assignmentsFor(draft), expected_revision: schedule?.revision || null,
    })
    const invalidDate = !draft.date || !request.success && request.error.issues.some((issue) => issue.path[0] === 'effective_date') || new Date(`${draft.date}T00:00:00+09:00`).getTime() <= Date.now()
    if (!request.success || invalidDate) {
      toast.error(invalidDate
        ? '交代日は明日以降を指定してください' : '交代後の幹部を1人以上指定してください', { id: validationToastId })
      if (invalidDate) dateRef.current?.focus()
      else document.getElementById(`transition-role-${members[0]?.id}`)?.focus()
      return
    }
    toast.dismiss(validationToastId)
    setConfirmation('save')
  }

  const complete = async (action: 'save' | 'cancel') => {
    toast.success(action === 'save' ? '幹部交代を予約しました' : '幹部交代の予定を取り消しました', { id: operationToastId, duration: 5000 })
    setOpen(false)
    setConfirmation(null)
    setUncertain(null)
    await onApplied()
  }

  const submit = async (action: 'save' | 'cancel') => {
    if (inFlight.current || blocked || uncertain) return
    inFlight.current = true
    setBusy(true)
    try {
      if (action === 'save') {
        const response = await apiClient.saveExecutiveTransition({
          effective_date: draft.date, assignments: assignmentsFor(draft), expected_revision: schedule?.revision || null,
        })
        if (!response.success) throw new Error('UNKNOWN_RESULT')
      } else {
        if (!schedule) return
        const response = await apiClient.cancelExecutiveTransition(schedule.revision)
        if (!response.success) throw new Error('UNKNOWN_RESULT')
      }
      await complete(action)
    } catch (error) {
      setConfirmation(null)
      if (!(error instanceof HttpError) || error.status >= 500) {
        setUncertain(action)
        toast.error('保存結果を確認できませんでした。「保存結果を確認」から最新の状態を確認してください', { id: operationToastId })
      } else reportError(error)
    } finally { setBusy(false); inFlight.current = false }
  }

  const checkResult = async () => {
    if (inFlight.current || !uncertain) return
    inFlight.current = true
    setBusy(true)
    try {
      const response = await apiClient.getExecutiveTransition()
      if (!response.success) throw new Error('LOAD_FAILED')
      const latest = response.data ? ExecutiveTransitionSchema.parse(response.data) : null
      const confirmed = uncertain === 'cancel'
        ? latest?.revision === schedule?.revision && latest?.status === 'CANCELLED'
        : latest?.status === 'PENDING' && latest.effective_date === draft.date && assignmentsKey(latest.assignments) === assignmentsKey(assignmentsFor(draft))
      if (confirmed) await complete(uncertain)
      else if ((latest?.revision || null) === (schedule?.revision || null) && latest?.status === schedule?.status) {
        setUncertain(null)
        toast.info('変更は反映されていません。入力を確認して、もう一度操作してください', { id: operationToastId, duration: 5000 })
      } else {
        setUncertain(null)
        setBlocked(true)
        toast.error('交代予定が変更または実行されています。入力は保持しています。閉じて最新の予定を読み込んでください', { id: operationToastId })
      }
    } catch (error) { reportError(error) }
    finally { setBusy(false); inFlight.current = false }
  }

  const assignments = assignmentsFor(draft)
  const retiring = members.filter((member) => member.role !== 'MBR' && draft.roles[member.id] === 'MBR')
  const visible = members.filter((member) => `${member.name} ${member.nickname || ''} ${member.student_number}`.toLowerCase().includes(search.toLowerCase()))
  return <>
    {enabled && <div ref={triggerRef} className="flex justify-end py-4">
      <LoadingButton variant="outline" isLoading={busy && !open} onClick={start}>
        幹部交代
      </LoadingButton>
    </div>}
    <DraftDialog open={open && enabled} onOpenChange={setOpen} title="幹部交代" draft={draft} busy={busy}
      onBack={() => setConfirmation(null)} confirmation={confirmation && <div className="space-y-4">
        <p className="font-medium">{confirmation === 'cancel' ? schedule?.effective_date : draft.date} 00:00（JST）の交代{confirmation === 'cancel' ? '予定を取り消しますか？' : 'を予約しますか？'}</p>
        {confirmation === 'save' ? <>
          <ul className="space-y-2 text-sm">{assignments.map((entry) => <li key={entry.user_id} className="break-words">
            {members.find((member) => member.id === entry.user_id)?.name}：{roleNames[entry.role as Role]}
          </li>)}</ul>
          <p className="text-sm">新幹部 {assignments.length}人・部員へ戻る現幹部 {retiring.length}人</p>
          <p className="text-sm text-muted-foreground">交代後の幹部に指定されていない現幹部は部員になります。管理者の役職は維持されます。</p>
        </> : <p className="text-sm">現在の役職は変更されません。</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>戻る</Button>
          <LoadingButton variant={confirmation === 'cancel' ? 'destructive' : 'default'} isLoading={busy} onClick={() => submit(confirmation)}>
            {confirmation === 'cancel' ? '予定を取り消す' : '一括で予約する'}
          </LoadingButton>
        </DialogFooter>
      </div>}>
      {schedule && <div className="rounded-md border p-3 text-sm">
        <span className="font-medium">{statuses[schedule.status]}</span>：{schedule.effective_date} 00:00（JST）
      </div>}
      <div className="space-y-2">
        <Label htmlFor="executive-transition-date">交代日（午前0時・JST）</Label>
        <Input ref={dateRef} id="executive-transition-date" type="date" disabled={Boolean(uncertain)} value={draft.date} className="text-base"
          onChange={(event) => setDraft((previous) => ({ ...previous, date: event.target.value }))} />
      </div>
      <p className="text-sm text-muted-foreground">指定日の午前0時に全員の役職を一括反映します。管理者の役職は維持されます。</p>
      <div className="space-y-2">
        <Label htmlFor="executive-transition-search">メンバーを検索</Label>
        <Input id="executive-transition-search" value={search} className="text-base" onChange={(event) => setSearch(event.target.value)} />
        {search && <Button variant="outline" size="sm" onClick={() => setSearch('')}>検索をクリア</Button>}
      </div>
      <div className="text-sm">新幹部 {assignments.length}人／対象 {members.length}人（表示 {visible.length}人）</div>
      <div className="max-h-64 space-y-3 overflow-y-auto">
        {visible.map((member) => <div key={member.id} className="rounded-md border p-3 space-y-2">
          <Label htmlFor={`transition-role-${member.id}`} className="block break-words">{member.student_number} {member.name}：交代後の役職</Label>
          <div className="text-sm text-muted-foreground">現在：{roleNames[member.role]}</div>
          <select id={`transition-role-${member.id}`} disabled={Boolean(uncertain)} value={draft.roles[member.id] || 'MBR'}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setDraft((previous) => ({ ...previous, roles: { ...previous.roles, [member.id]: event.target.value } }))}>
            <option value="MBR">部員</option>
            {ExecutiveRoleSchema.options.map((role) => <option key={role} value={role}>{roleNames[role as Role]}</option>)}
          </select>
        </div>)}
      </div>
      {schedule?.status === 'PENDING' && <Button variant="outline" className="w-full" disabled={busy || blocked || Boolean(uncertain)} onClick={() => setConfirmation('cancel')}>交代予定の取消へ進む</Button>}
      {uncertain && <LoadingButton variant="outline" className="w-full" isLoading={busy} onClick={checkResult}>保存結果を確認</LoadingButton>}
      <LoadingButton className="w-full" disabled={blocked || Boolean(uncertain)} isLoading={busy} onClick={prepareSave}>交代内容を確認</LoadingButton>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" disabled={busy}>キャンセル</Button></DialogClose>
      </DialogFooter>
    </DraftDialog>
  </>
}
