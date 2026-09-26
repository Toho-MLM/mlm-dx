import { ToastNotice } from '@/components/toast-notice'
import { useState, useEffect } from 'react'
import { DialogFooter } from '@/components/ui/dialog'
import { DraftDialog } from '@/components/draft-dialog'
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { addDays, format } from 'date-fns'
import { showSuccessToast } from "@/lib/utils"
import { Event } from "@/app/types"
import { apiClient } from '@/lib/api'
import { toast } from '@/lib/toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { translateError } from '@/lib/error-label'

interface EventFormProps {
  event?: Event
  isOpen: boolean
  onClose: () => void
  onSuccess?: (newEvent?: Event) => void
}

const toJSTCalendarDate = (value: string, exclusiveEnd = false) => {
  const instant = new Date(new Date(value).getTime() - (exclusiveEnd ? 1 : 0))
  const dateKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant)
  return new Date(`${dateKey}T00:00:00`)
}

export function EventForm({ event, isOpen, onClose, onSuccess }: EventFormProps) {
  const [title, setTitle] = useState(event?.title || '')
  const [date, setDate] = useState<Date | undefined>(event?.event_date ? toJSTCalendarDate(event.event_date) : undefined)
  const [entryDeadline, setEntryDeadline] = useState<Date | undefined>(event?.entry_deadline ? toJSTCalendarDate(event.entry_deadline, true) : undefined)
  const [setlistDeadline, setSetlistDeadline] = useState<Date | undefined>(event?.setlist_deadline ? toJSTCalendarDate(event.setlist_deadline, true) : undefined)
  const [isFreeBand, setIsFreeBand] = useState(event ? event.group_limit !== 0 : true)
  const [freeBandLimit, setFreeBandLimit] = useState(event && event.group_limit > 0 ? event.group_limit.toString() : '2')
  const [songLimit, setSongLimit] = useState<number>(event?.song_limit ?? 2)
  const [entryAccepting, setEntryAccepting] = useState(event?.is_entry_accepting ?? true)
  const [setlistAccepting, setSetlistAccepting] = useState(event?.is_setlist_accepting ?? true)
  const [isPending, setIsPending] = useState(false)

  const today = toJSTCalendarDate(new Date().toISOString())
  today.setHours(0, 0, 0, 0)

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setDate(toJSTCalendarDate(event.event_date))
      setEntryDeadline(toJSTCalendarDate(event.entry_deadline, true))
      setSetlistDeadline(toJSTCalendarDate(event.setlist_deadline, true))
      setIsFreeBand(event.group_limit !== 0)
      setFreeBandLimit(event.group_limit > 0 ? event.group_limit.toString() : '2')
      setSongLimit(event.song_limit ?? 2)
      setEntryAccepting(event.is_entry_accepting ?? true)
      setSetlistAccepting(event.is_setlist_accepting ?? true)
    } else {
      setTitle('')
      setDate(undefined)
      setEntryDeadline(undefined)
      setSetlistDeadline(undefined)
      setIsFreeBand(true)
      setFreeBandLimit('2')
      setSongLimit(2)
      setEntryAccepting(true)
      setSetlistAccepting(true)
    }
  }, [event])

  const onDialogClose = () => {
    if (isPending) return
    onClose()
  }

  const validateDates = (): string | null => {
    if (!entryDeadline || !setlistDeadline || !date) return null

    const originalDates = [event?.event_date, event?.entry_deadline, event?.setlist_deadline]
    const selectedDates = [date, entryDeadline, setlistDeadline]
    if (selectedDates.some((value, index) => value < today && (
      !originalDates[index] || format(value, 'yyyy-MM-dd') !== format(toJSTCalendarDate(originalDates[index]!, index > 0), 'yyyy-MM-dd')
    ))) {
      return '変更する日付は今日以降を指定してください'
    }

    if (entryDeadline > setlistDeadline) {
      return '出演締切はセットリスト締切より後に設定できません'
    }
    if (setlistDeadline >= date) {
      return 'セットリスト締切はイベント日より前である必要があります'
    }
    return null
  }

  const handleSongLimitChange = (value: string) => {
    if (value === '') {
      setSongLimit(NaN)
      return
    }
    const parsed = parseInt(value, 10)
    if (Number.isNaN(parsed)) {
      return
    }
    setSongLimit(parsed)
  }

  const handleSubmit = async () => {
    if (isPending || !title.trim() || !date || !entryDeadline || !setlistDeadline) return

    const validationError = validateDates();
    if (validationError) {
      toast.error(validationError)
      return
    }

    const formattedDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    const formattedEntryDeadline = `${format(addDays(entryDeadline, 1), 'yyyy-MM-dd')}T00:00:00+09:00`
    const formattedSetlistDeadline = `${format(addDays(setlistDeadline, 1), 'yyyy-MM-dd')}T00:00:00+09:00`
    const groupLimitNum = isFreeBand ? parseInt(freeBandLimit) || 2 : 0
    const songLimitNum = Number.isNaN(songLimit) ? 2 : songLimit

    try {
      setIsPending(true)
        if (event) {
          const response = await apiClient.updateEvent(event.id, {
            title,
            event_date: formattedDate,
            entry_deadline: formattedEntryDeadline,
            is_entry_accepting: entryAccepting,
            setlist_deadline: formattedSetlistDeadline,
            is_setlist_accepting: setlistAccepting,
            group_limit: groupLimitNum,
            song_limit: songLimitNum,
          })
          
          if (response.success) {
            showSuccessToast({ message: 'イベントを更新しました' })
            const updatedEvent: Event = {
              ...event,
              title,
              event_date: formattedDate,
              entry_deadline: formattedEntryDeadline,
              is_entry_accepting: entryAccepting,
              setlist_deadline: formattedSetlistDeadline,
              is_setlist_accepting: setlistAccepting,
              group_limit: groupLimitNum,
              song_limit: songLimitNum,
            }
            onClose()
            onSuccess?.(updatedEvent)
          } else {
            toast.error('イベントの更新中にエラーが発生しました', { description: translateError(response.error || 'UNKNOWN_ERROR') })
          }
        } else {
          const response = await apiClient.createEvent({
            title,
            event_date: formattedDate,
            entry_deadline: formattedEntryDeadline,
            is_entry_accepting: entryAccepting,
            setlist_deadline: formattedSetlistDeadline,
            is_setlist_accepting: setlistAccepting,
            group_limit: groupLimitNum,
            song_limit: songLimitNum,
          })
          
          if (response.success) {
            showSuccessToast({ message: 'イベントを作成しました' })
            onClose()
            onSuccess?.()
          } else {
            toast.error('イベントの作成中にエラーが発生しました', { description: translateError(response.error || 'UNKNOWN_ERROR') })
          }
        }
    } catch {
      toast.error('エラーが発生しました')
    } finally {
      setIsPending(false)
    }
  }

  const isFormValid = title.trim() !== '' && 
    date !== undefined && 
    entryDeadline !== undefined && 
    setlistDeadline !== undefined

  return (
    <DraftDialog open={isOpen} onOpenChange={(open) => { if (!open) onDialogClose() }} title={event ? 'イベントを更新' : 'イベントを作成'} busy={isPending}
      draft={{ title, date, entryDeadline, setlistDeadline, isFreeBand, freeBandLimit, songLimit, entryAccepting, setlistAccepting }}>
        <fieldset disabled={isPending} className="space-y-4">
          <Label htmlFor="event-title">イベント名</Label>
          <Input
            id="event-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div>
            <label htmlFor="event-date" className="text-sm font-medium mb-2 block">イベント日</label>
            <Input
                id="event-date"
                type="date"
                value={date ? format(date, 'yyyy-MM-dd') : ''}
                min={format(setlistDeadline && setlistDeadline >= today ? addDays(setlistDeadline, 1) : today, 'yyyy-MM-dd')}
                onChange={(e) => setDate(e.target.value ? new Date(`${e.target.value}T00:00:00`) : undefined)}
              />
          </div>
          <div>
            <label htmlFor="event-entryDeadline" className="text-sm font-medium mb-2 block">出演締切</label>
            <div className="flex items-center gap-3">
              <Input
                id="event-entryDeadline"
                type="date"
                value={entryDeadline ? format(entryDeadline, 'yyyy-MM-dd') : ''}
                min={format(today, 'yyyy-MM-dd')}
                max={setlistDeadline ? format(setlistDeadline, 'yyyy-MM-dd') : undefined}
                onChange={(e) => setEntryDeadline(e.target.value ? new Date(`${e.target.value}T00:00:00`) : undefined)}
              />
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <Label htmlFor="accepting-entries" className="text-sm font-medium">受付中</Label>
                <Switch
                  id="accepting-entries"
                  checked={entryAccepting}
                  onCheckedChange={setEntryAccepting}
                />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="event-setlistDeadline" className="text-sm font-medium mb-2 block">セットリスト締切</label>
            <div className="flex items-center gap-3">
              <Input
                id="event-setlistDeadline"
                type="date"
                value={setlistDeadline ? format(setlistDeadline, 'yyyy-MM-dd') : ''}
                min={format(entryDeadline && entryDeadline > today ? entryDeadline : today, 'yyyy-MM-dd')}
                max={date ? format(addDays(date, -1), 'yyyy-MM-dd') : undefined}
                onChange={(e) => setSetlistDeadline(e.target.value ? new Date(`${e.target.value}T00:00:00`) : undefined)}
              />
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <Label htmlFor="accepting-setlist" className="text-sm font-medium">受付中</Label>
                <Switch
                  id="accepting-setlist"
                  checked={setlistAccepting}
                  onCheckedChange={setSetlistAccepting}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">出場バンド制限</label>
            <Select value={isFreeBand ? 'free' : 'main'} onValueChange={(value) => setIsFreeBand(value === 'free')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">本バンド必須</SelectItem>
                <SelectItem value="free">自由バンド限定</SelectItem>
              </SelectContent>
            </Select>
            {isFreeBand && (
              <div className="mt-3">
                <label className="text-xs text-gray-600 mb-2 block">バンド数上限</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="2"
                  value={freeBandLimit}
                  onChange={(e) => setFreeBandLimit(e.target.value)}
                />
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">曲数上限</label>
            <Input
              type="number"
              min="1"
              value={Number.isNaN(songLimit) ? '' : songLimit}
              onChange={(e) => handleSongLimitChange(e.target.value)}
            />
          </div>
          {event && (
            <>
              {(() => {
                const newGroupLimit = isFreeBand ? parseInt(freeBandLimit) || 2 : 0;
                const oldGroupLimit = event.group_limit;
                if (newGroupLimit < oldGroupLimit && oldGroupLimit > 0) {
                  return (
                    <ToastNotice variant="warning" message="登録状況の確認が必要です" description={`現在の出演登録が新しい上限を超える場合、この更新は保存できません。先に出演登録を整理してください。`} />
                  );
                }
                return null;
              })()}
              {(() => {
                const newSongLimit = Number.isNaN(songLimit) ? 2 : songLimit;
                const oldSongLimit = event.song_limit ?? 2;
                if (newSongLimit < oldSongLimit) {
                  return (
                    <ToastNotice variant="warning" message="セットリストの自動削除" description={`曲数上限が${oldSongLimit}から${newSongLimit}に減少したため、各バンドのセットリストの超過分が自動的に削除されます。`} />
                  );
                }
                return null;
              })()}
            </>
          )}
          <DialogFooter>
            <LoadingButton onClick={handleSubmit} isLoading={isPending} disabled={!isFormValid}>
              {event ? '保存' : '作成'}
            </LoadingButton>
          </DialogFooter>
        </fieldset>
    </DraftDialog>
  )
}
