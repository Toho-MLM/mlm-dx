import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Group, GroupMember, Instrument, Member, instrumentColors, instrumentNames } from "@/app/types"
import { X, Plus, ChevronDown, Loader2, AlertTriangle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { supabase } from '@/supabase/supabaseClient'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '../context/AuthContext'
interface BandFormProps {
  band?: Group
  members: Member[]
  isOpen: boolean
  onClose: () => void
}

export function BandForm({ band, members, isOpen, onClose }: BandFormProps) {
  const [name, setName] = useState(band?.name || '')
  const [bandMembers, setBandMembers] = useState<GroupMember[]>(band?.assignments || [])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (band) {
      setName(band.name)
      setBandMembers(band.assignments)
    } else {
      setName('')
      setBandMembers([])
    }
    setErrorMessage(null)
  }, [band])

  const handleSubmit = async () => {
    if (name.trim() === '') {
      setErrorMessage('バンド名を入力してください。')
      return
    }
    if (bandMembers.length === 0) {
      setErrorMessage('少なくとも1人のメンバーを追加してください。')
      return
    }
    if (bandMembers.some(member => member.instruments.length === 0)) {
      setErrorMessage('全てのメンバーに少なくとも1つの楽器を割り当ててください。')
      return
    }
    if (!bandMembers.some(member => member.id === user?.id)) {
      setErrorMessage('自分をメンバーに追加してください。');
      return
    }

    try {
      setIsSending(true)
      const { data, error } = await supabase.rpc('upsert_group', {
        p_id: band ? band.id : null,
        p_name: name,
        p_is_main: true,
        p_assignments: bandMembers.map(bm => ({ memberId: bm.id, instruments: bm.instruments }))
      })
      if (error) {
        setErrorMessage('データの送信中にエラーが発生しました。' + error.message);
      } else if ('error' in data) {
        setErrorMessage('データの処理中にエラーが発生しました。' + data.details);
      } else {
        onClose()
      }
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setIsSending(false)
    }
  }

  const addMember = (memberId: string) => {
    setBandMembers([...bandMembers, { id: memberId, instruments: [] }])
  }

  const removeMember = (memberId: string) => {
    setBandMembers(bandMembers.filter(bm => bm.id !== memberId))
  }

  const addInstrument = (memberId: string, instrument: Instrument) => {
    setBandMembers(bandMembers.map(bm => {
      if (bm.id === memberId) {
        return { ...bm, instruments: [...bm.instruments, instrument] }
      }
      return bm
    }))
  }

  const removeInstrument = (memberId: string, instrument: Instrument) => {
    setBandMembers(bandMembers.map(bm => {
      if (bm.id === memberId) {
        return { ...bm, instruments: bm.instruments.filter(i => i !== instrument) }
      }
      return bm
    }))
  }

  const availableInstruments = (bandMember: GroupMember) => members.find(m => m.id === bandMember.id)?.instruments.filter(i => !bandMember.instruments.includes(i))

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{band ? 'バンドを編集' : 'バンドを追加'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="バンド名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="space-y-2">
            <h3 className="font-medium">メンバー</h3>
            {bandMembers.map((bandMember) => {
              const member = members.find(m => m.id === bandMember.id)
              return (
                <div key={bandMember.id} className="flex items-center space-x-2 p-2 border rounded">
                  <span className="flex-grow">{member?.name}</span>
                  <div className="flex items-center space-x-1">
                    {bandMember.instruments.map((instrument) => (
                      <Badge
                        key={instrument}
                        variant="secondary"
                        className={`text-xs ${instrumentColors[instrument]}`}
                      >
                        {instrument}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1 p-0"
                          onClick={() => removeInstrument(bandMember.id, instrument)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={availableInstruments(bandMember)?.length === 0}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {availableInstruments(bandMember)?.map((instrument) => (
                        <DropdownMenuItem
                          key={instrument}
                          onClick={() => addInstrument(bandMember.id, instrument)}
                        >
                          {instrumentNames[instrument]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="ghost" size="icon" onClick={() => removeMember(bandMember.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          {errorMessage && (
              <Alert variant="destructive" className="outline">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>エラー</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          <div className="flex items-center justify-between">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  メンバーを追加 <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-[200px] overflow-y-auto">
                {members
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .filter(m => !bandMembers.some(bm => bm.id === m.id))
                  .filter(m => m.id != null)
                  .map((member) => (
                    <DropdownMenuItem
                      key={member.id}
                      onClick={() => addMember(member.id)}
                    >
                      {member.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handleSubmit} disabled={isSending}>
              {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

