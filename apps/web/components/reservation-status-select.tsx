'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { eventStateNames, ReservationState } from '@/app/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { HttpError } from '@/lib/http-client'
import { translateError } from '@/lib/error-label'

type Props = {
  value: ReservationState
  save: (value: ReservationState) => Promise<{ success: boolean; error?: string }>
  read: () => Promise<ReservationState>
  onConfirmed: (value: ReservationState) => void | Promise<void>
  onBusyChange: (busy: boolean) => void
}

export function ReservationStatusSelect(props: Props) {
  const id = useId()
  const [value, setValue] = useState(props.value)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef(false)
  const attempted = useRef(props.value)
  const confirmed = useRef(props.value)
  const latest = useRef(props)
  latest.current = props
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; toast.dismiss(id) }
  }, [id])
  useEffect(() => {
    if (!pending.current) { confirmed.current = props.value; setValue(props.value) }
  }, [props.value])

  const setPending = (next: boolean) => {
    pending.current = next
    setBusy(next)
    latest.current.onBusyChange(next)
  }
  const accept = async (next: ReservationState) => {
    confirmed.current = next
    setValue(next)
    setUncertain(false)
    await latest.current.onConfirmed(next)
  }
  const failure = (description?: string) => {
    setValue(confirmed.current)
    toast.error('ステータスを保存できませんでした', {
      id, duration: Infinity, description,
      action: { label: '再試行', onClick: () => { if (alive.current) void change(attempted.current) } },
    })
  }
  const reconcile = async () => {
    try {
      const actual = await latest.current.read()
      if (!alive.current) return
      await accept(actual)
      if (actual === attempted.current) {
        toast.success('ステータスの保存を確認しました', { id, duration: 5000, description: undefined, action: undefined })
      } else {
        toast.info('最新のステータスを取得しました。変更する場合は選び直してください。', { id, duration: 5000, description: undefined, action: undefined })
      }
    } catch {
      if (!alive.current) return
      setUncertain(true)
      toast.error('保存結果を確認できません。最新状態を確認してください。', {
        id, duration: Infinity, description: undefined,
        action: { label: '結果を確認', onClick: () => { if (alive.current) void check() } },
      })
    }
  }
  const check = async () => {
    if (pending.current) return
    setPending(true)
    try { await reconcile() } finally { if (alive.current) setPending(false) }
  }
  const change = async (next: ReservationState) => {
    if (pending.current || uncertain || next === confirmed.current) return
    attempted.current = next
    setValue(next)
    setPending(true)
    try {
      const result = await latest.current.save(next)
      if (!alive.current) return
      if (!result.success) { failure(translateError(result.error || 'UNKNOWN_ERROR')); return }
      await accept(next)
      toast.success('ステータスを変更しました', { id, duration: 5000, description: undefined, action: undefined })
    } catch (error) {
      if (!alive.current) return
      if (error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        failure(translateError(error.message))
      } else {
        setUncertain(true)
        await reconcile()
      }
    } finally {
      if (alive.current) setPending(false)
    }
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>ステータス</Label>
      <Select value={value} onValueChange={(next) => void change(next as ReservationState)} disabled={busy || uncertain}>
        <SelectTrigger id={id} aria-busy={busy}><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.values(ReservationState).map((state) => <SelectItem key={state} value={state}>{eventStateNames[state]}</SelectItem>)}
        </SelectContent>
      </Select>
      {uncertain && <Button variant="outline" disabled={busy} onClick={() => void check()}>保存結果を確認</Button>}
    </div>
  )
}
