import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Group, GroupMember, Instrument, Member, instrumentColors, instrumentNames } from "@/app/types"
import { X, Plus, ChevronDown, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"

interface BandFormProps {
  band?: Group
  members: Member[]
  isOpen: boolean
  onClose: () => void
  onSave: (band: Omit<Group, 'id'>) => void
  isSending: boolean
  errorMessage: string | null
}

export function BandForm({ band, members, isOpen, onClose, onSave, isSending, errorMessage }: BandFormProps) {
  const [name, setName] = useState(band?.name || '')
  const [bandMembers, setBandMembers] = useState<GroupMember[]>(band?.members || [])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (band) {
      setName(band.name)
      setBandMembers(band.members)
    } else {
      setName('')
      setBandMembers([])
    }
    setError(null)
  }, [band])

  const handleSave = () => {
    if (name.trim() === '') {
      setError('バンド名を入力してください。')
      return
    }
    if (bandMembers.length === 0) {
      setError('少なくとも1人のメンバーを追加してください。')
      return
    }
    if (bandMembers.some(member => member.instruments.length === 0)) {
      setError('全てのメンバーに少なくとも1つの楽器を割り当ててください。')
      return
    }
    onSave({
      name,
      isMain: band?.isMain ?? false,
      members: bandMembers,
    })
    onClose()
  }

  const addMember = (memberId: string) => {
    setBandMembers([...bandMembers, { memberId, instruments: [] }])
  }

  const removeMember = (memberId: string) => {
    setBandMembers(bandMembers.filter(bm => bm.memberId !== memberId))
  }

  const addInstrument = (memberId: string, instrument: Instrument) => {
    setBandMembers(bandMembers.map(bm => {
      if (bm.memberId === memberId) {
        return { ...bm, instruments: [...bm.instruments, instrument] }
      }
      return bm
    }))
  }

  const removeInstrument = (memberId: string, instrument: Instrument) => {
    setBandMembers(bandMembers.map(bm => {
      if (bm.memberId === memberId) {
        return { ...bm, instruments: bm.instruments.filter(i => i !== instrument) }
      }
      return bm
    }))
  }

  const availableInstruments = (bandMember: GroupMember) => members.find(m => m.id === bandMember.memberId)?.instruments.filter(i => !bandMember.instruments.includes(i))

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
              const member = members.find(m => m.id === bandMember.memberId)
              return (
                <div key={bandMember.memberId} className="flex items-center space-x-2 p-2 border rounded">
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
                          onClick={() => removeInstrument(bandMember.memberId, instrument)}
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
                          onClick={() => addInstrument(bandMember.memberId, instrument)}
                        >
                          {instrumentNames[instrument]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="ghost" size="icon" onClick={() => removeMember(bandMember.memberId)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
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
                  .filter(m => !bandMembers.some(bm => bm.memberId === m.id))
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
            {error && <p className="text-red-500">{error}</p>}
            <Button onClick={handleSave} disabled={isSending}>
              {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}

