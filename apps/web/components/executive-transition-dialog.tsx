'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getExecutiveTransitionCohort, ExecutiveRoleSchema, ExecutiveTransitionSchema, SaveExecutiveTransitionRequestSchema, type ExecutiveAssignment, type ExecutiveTransition } from '@shared-schemas'
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

type ExecutiveRole = ExecutiveAssignment['role']
type Draft = { date: string; successors: Record<ExecutiveRole, string> }
const executiveRoles = ExecutiveRoleSchema.options
const emptySuccessors = (): Draft['successors'] => ({ MGR: '', CHF: '', MAC: '', NHD: '', NAC: '' })
const operationToastId = 'executive-transition-operation'
const validationToastId = 'executive-transition-validation'
const statuses = { PENDING: '交代予定', APPLIED: '交代済み', CANCELLED: '取消済み', FAILED: '交代停止' }
const errorLabels: Record<string, string> = {
  INVALID_EFFECTIVE_DATE: '交代日は明日以降を指定してください',
  MEMBER_UNAVAILABLE: '交代対象のメンバーが削除されたか、ADMに変更されています。最新のメンバーを確認してください',
  TRANSITION_CONFLICT: '交代予定が変更または実行されています。入力は保持しています。閉じて最新の予定を読み込んでください',
  INVALID_REQUEST_DATA: '交代日と交代後の幹部を確認してください',
}
const assignmentsFor = (draft: Draft): ExecutiveAssignment[] => executiveRoles
  .filter((role) => Boolean(draft.successors[role]))
  .map((role) => ({ user_id: draft.successors[role], role }))
const assignmentsKey = (entries: ExecutiveAssignment[]) => JSON.stringify([...entries].sort((a, b) => a.user_id.localeCompare(b.user_id)))

export function ExecutiveTransitionDialog({ enabled, onApplied, renderTrigger }: {
  enabled: boolean
  onApplied: () => Promise<void>
  renderTrigger?: (props: { onClick: () => void; isLoading: boolean }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [schedule, setSchedule] = useState<ExecutiveTransition | null>(null)
  const [draft, setDraft] = useState<Draft>({ date: '', successors: emptySuccessors() })
  const [cohort, setCohort] = useState(() => getExecutiveTransitionCohort(new Date()))
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
    if (!enabled || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const [memberResponse, transitionResponse] = await Promise.all([apiClient.getMemberList(), apiClient.getExecutiveTransition()])
      if (!memberResponse.success || !memberResponse.data || !transitionResponse.success) throw new Error('LOAD_FAILED')
      const latest = transitionResponse.data ? ExecutiveTransitionSchema.parse(transitionResponse.data) : null
      const eligible = memberResponse.data.filter((member) => member.role !== 'ADM')
      const nextCohort = getExecutiveTransitionCohort(new Date())
      const candidates = eligible.filter((member) => nextCohort.prefixes.some((prefix) => member.student_number.toUpperCase().startsWith(prefix)))
      const successors = emptySuccessors()
      if (latest?.status === 'PENDING') {
        for (const entry of latest.assignments) {
          if (candidates.some((member) => member.id === entry.user_id) && !successors[entry.role]) successors[entry.role] = entry.user_id
        }
      }
      setMembers(eligible)
      setCohort(nextCohort)
      setSchedule(latest)
      setDraft({
        date: latest?.status === 'PENDING' ? latest.effective_date : '',
        successors,
      })
      setConfirmation(null)
      setUncertain(null)
      setBlocked(false)
      restoreFocus.current = true
      setOpen(true)
      if (latest?.status === 'FAILED') toast.error('交代対象の削除またはADMへの変更により、幹部交代を停止しました。役職は変更していません。設定を見直してください')
      if (latest?.status === 'PENDING' && (latest.assignments.some((entry) => !candidates.some((member) => member.id === entry.user_id))
        || new Set(latest.assignments.map((entry) => entry.role)).size !== latest.assignments.length)) {
        toast.warning('予定に対象外のメンバーまたは同じ役職の複数人が含まれています。交代先を選び直してください')
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
      else document.getElementById('transition-successor-MGR')?.focus()
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
  const retiring = members.filter((member) => member.role !== 'MBR' && !assignments.some((entry) => entry.user_id === member.id))
  const candidates = members.filter((member) => cohort.prefixes.some((prefix) => member.student_number.toUpperCase().startsWith(prefix)))
    .sort((a, b) => a.student_number.localeCompare(b.student_number))
  const currentNames = (role: ExecutiveRole) => members.filter((member) => member.role === role).map((member) => member.name).join('、') || '担当者なし'
  const successorName = (role: ExecutiveRole) => members.find((member) => member.id === draft.successors[role])?.name || '指定なし'
  return <>
    {enabled && <div ref={triggerRef} className="inline-flex shrink-0">
      {renderTrigger ? renderTrigger({ onClick: () => { void start() }, isLoading: busy && !open }) : <LoadingButton variant="outline" isLoading={busy && !open} onClick={start}>
        幹部交代
      </LoadingButton>}
    </div>}
    <DraftDialog open={open && enabled} onOpenChange={setOpen} title="幹部交代" draft={draft} busy={busy}
      onBack={() => setConfirmation(null)} confirmation={confirmation && <div className="space-y-4">
        <p className="font-medium">{confirmation === 'cancel' ? schedule?.effective_date : draft.date} 00:00（JST）の交代{confirmation === 'cancel' ? '予定を取り消しますか？' : 'を予約しますか？'}</p>
        {confirmation === 'save' ? <>
          <ul className="space-y-3 text-sm">{executiveRoles.map((role) => <li key={role} className="break-words">
            <div className="font-medium">{roleNames[role as Role]}</div>
            <div>{currentNames(role)} → {successorName(role)}</div>
          </li>)}</ul>
          <p className="text-sm">新幹部 {assignments.length}人・部員へ戻る現幹部 {retiring.length}人</p>
          <p className="text-sm text-muted-foreground">交代後の幹部に指定されていない現幹部は部員になります。ADMの役職は維持されます。</p>
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
      <div className="text-sm">交代先：{cohort.year}年度（{cohort.prefixes.join(' / ')}）・候補 {candidates.length}人</div>
      <div className="space-y-4">
        {executiveRoles.map((role) => <div key={role} className="space-y-2 rounded-md border p-3">
          <Label htmlFor={`transition-successor-${role}`} className="block">{roleNames[role as Role]}</Label>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div className="min-w-0 break-words text-sm"><span className="sr-only">現在の担当者：</span>{currentNames(role)}</div>
            <span aria-hidden="true">→</span>
            <select id={`transition-successor-${role}`} aria-label={`${roleNames[role as Role]}の交代先`} disabled={Boolean(uncertain)} value={draft.successors[role]}
              className="h-11 min-w-0 w-full rounded-md border border-input bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setDraft((previous) => ({ ...previous, successors: { ...previous.successors, [role]: event.target.value } }))}>
              <option value="">指定なし</option>
              {candidates.map((member) => <option key={member.id} value={member.id}
                disabled={executiveRoles.some((other) => other !== role && draft.successors[other] === member.id)}>
                {member.name}（{member.student_number}）
              </option>)}
            </select>
          </div>
          {draft.successors[role] && <div className="break-words text-sm">交代先：{successorName(role)}</div>}
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
