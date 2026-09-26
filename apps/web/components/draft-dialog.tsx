'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'

type Props<T> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  draft: T
  onDiscard?: (initial: T) => void
  busy: boolean
  children: ReactNode
  confirmation?: ReactNode
  onBack?: () => void
}

export function DraftDialog<T>({ open, onOpenChange, title, draft, busy, children, confirmation, onBack, onDiscard }: Props<T>) {
  const initialDraft = useRef(draft)
  const latestDraft = useRef(draft)
  latestDraft.current = draft
  const snapshot = JSON.stringify(draft)
  const latest = useRef(snapshot)
  latest.current = snapshot
  const [initial, setInitial] = useState(snapshot)
  const [discarding, setDiscarding] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (open) { initialDraft.current = latestDraft.current; setInitial(latest.current); setDiscarding(false) }
  }, [open])
  const hasConfirmation = Boolean(confirmation)
  useEffect(() => { titleRef.current?.focus() }, [discarding, hasConfirmation])
  const close = () => {
    if (busy) return
    if (confirmation) { onBack?.(); return }
    if (discarding) { setDiscarding(false); return }
    if (snapshot !== initial) { setDiscarding(true); return }
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) onOpenChange(true); else close() }}>
      <DialogContent aria-busy={busy}>
        <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>{discarding ? '変更を破棄しますか？' : title}</DialogTitle></DialogHeader>
        <fieldset hidden={discarding || Boolean(confirmation)} disabled={busy} className="min-w-0 space-y-4" onInvalid={(event) => {
          event.preventDefault()
          const input = event.target as HTMLInputElement
          if (input === event.currentTarget.querySelector('input:invalid, select:invalid, textarea:invalid')) {
            input.focus()
            toast.error('入力内容を確認してください', { id: 'form-validation' })
          }
        }}>{children}</fieldset>
        {confirmation || (discarding && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscarding(false)}>編集を続ける</Button>
            <Button variant="destructive" onClick={() => { onDiscard?.(initialDraft.current); onOpenChange(false) }}>破棄して閉じる</Button>
          </DialogFooter>
        ))}
      </DialogContent>
    </Dialog>
  )
}
