'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ReservationEditForm, type ReservationEditFormProps } from '@/components/reservation-edit-form'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subject: string
  children: ReactNode
  busy: boolean
  editor?: Omit<ReservationEditFormProps, 'formId' | 'onDirtyChange' | 'isSaving'>
  onCancel?: () => void
  onDelete?: () => void
  confirmation?: ReactNode
  onBack?: () => void
}

// Keep the editor mounted while confirming, so returning never loses the draft.
export function ReservationDetailsDialog({ open, onClose, title, subject, children, busy, editor, onCancel, onDelete, confirmation, onBack }: Props) {
  const formId = useId()
  const [dirty, setDirty] = useState(false)
  const [view, setView] = useState<'edit' | 'discard' | 'delete' | 'cancel'>('edit')
  const heading = useRef<HTMLHeadingElement>(null)
  const hasConfirmation = Boolean(confirmation)
  useEffect(() => { heading.current?.focus() }, [view, hasConfirmation])
  const requestClose = () => {
    if (busy) return
    if (confirmation) { onBack?.(); return }
    if (view !== 'edit') { setView('edit'); return }
    if (dirty) { setView('discard'); return }
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
      <DialogContent aria-busy={busy}>
        <DialogHeader>
          <DialogTitle ref={heading} tabIndex={-1}>{confirmation ? '重複予約の確認' : view === 'discard' ? '変更を破棄しますか？' : view === 'delete' ? '予約を完全に削除しますか？' : view === 'cancel' ? '予約をキャンセルしますか？' : title}</DialogTitle>
        </DialogHeader>
        <div hidden={view !== 'edit' || Boolean(confirmation)}>
          <fieldset disabled={busy} className="space-y-4">
            {children}
            {editor && <ReservationEditForm {...editor} formId={formId} onDirtyChange={setDirty} isSaving={busy} />}
            <DialogFooter>
              {onDelete && <Button variant="destructive" onClick={() => setView('delete')}>完全に削除</Button>}
              {onCancel && <Button variant="outline" onClick={() => setView('cancel')}>予約をキャンセル</Button>}
              <Button variant="outline" onClick={requestClose}>閉じる</Button>
              {editor && <LoadingButton form={formId} type="submit" disabled={!dirty} isLoading={busy}>保存</LoadingButton>}
            </DialogFooter>
          </fieldset>
        </div>
        {confirmation || (view !== 'edit' && (
          <>
            <p className="break-words text-sm">{subject}</p>
            <p className="text-sm">{view === 'discard' ? '未保存の日時変更を破棄します。' : view === 'delete' ? '利用実績を含む予約情報を完全に削除します。この操作は取り消せません。' : 'この予約をキャンセルし、時間枠を空けます。'}</p>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setView('edit')}>編集を続ける</Button>
              <LoadingButton variant="destructive" isLoading={busy} onClick={view === 'discard' ? onClose : view === 'delete' ? onDelete : onCancel}>
                {view === 'discard' ? '破棄して閉じる' : view === 'delete' ? '完全に削除' : '予約をキャンセル'}
              </LoadingButton>
            </DialogFooter>
          </>
        ))}
      </DialogContent>
    </Dialog>
  )
}
