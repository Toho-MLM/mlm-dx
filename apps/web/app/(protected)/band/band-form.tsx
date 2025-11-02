import { useState, useEffect, useTransition, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Group, GroupMember, Instrument, Member, instrumentColors, instrumentNames } from "@/app/types"
import { X, Plus, ChevronDown, Loader2, AlertTriangle, UserRoundMinus, CircleCheckBig, XCircle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { apiClient } from '@/lib/api'
import { useAuth } from '../../context/AuthContext'
import { toast } from 'sonner'
import { translateError } from '@/lib/error-label'
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
interface BandFormProps {
  band?: Group
  memberOptions: { id: string; name: string; instruments: string[] }[]
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  isAdminMode?: boolean
}

export function BandForm({ band, memberOptions, isOpen, onClose, onSuccess, isAdminMode = false }: BandFormProps) {
  const [name, setName] = useState(band?.name || '')
  const [bandMembers, setBandMembers] = useState<GroupMember[]>(band?.assignments || [])
  const [isMain, setIsMain] = useState(band?.isMain ? 'main' : 'free')
  const [isPending, startTransition] = useTransition()
  const { user } = useAuth()

  useEffect(() => {
    if (band) {
      setName(band.name)
      setBandMembers(band.assignments)
      setIsMain(band.isMain ? 'main' : 'free')
    } else {
      setName('')
      setBandMembers([])
      setIsMain('free')
    }
  }, [band])

  const onDialogClose = () => {
    onClose()
  }

  const handleSubmit = async () => {
    if (!isFormValid) return;

    startTransition(async () => {
      try {
        const assignments = bandMembers.reduce((acc, bm) => {
          bm.instruments.forEach(instrument => {
            if (!acc[instrument]) {
              acc[instrument] = [];
            }
            acc[instrument].push(bm.id);
          });
          return acc;
        }, {} as Record<string, string[]>);

        const isMainBand = isMain === 'main'
        let response;
        if (band) {
          response = await apiClient.updateGroup(band.id, {
            name,
            assignments: JSON.stringify(assignments),
            is_main: isAdminMode ? isMainBand : band.isMain,
            is_active: true
          });
        } else {
          response = await apiClient.createGroup({
            name,
            assignments: JSON.stringify(assignments),
            is_main: isMainBand
          });
        }

        if (response.success) {
          setName('')
          setBandMembers([])
          onClose()
          onSuccess?.()
        } else {
          toast.error('データの送信中にエラーが発生しました', {
            description: translateError(response.error || 'UNKNOWN_ERROR')
          });
        }
      } catch (error) {
        toast.error('バンドの保存中にエラーが発生しました', {
          description: translateError((error as Error).message)
        })
      }
    })
  }

  const addMember = async (memberId: string) => {
    setBandMembers([...bandMembers, { id: memberId, instruments: [] }])
  }

  const removeMember = async (memberId: string) => {
    setBandMembers(bandMembers.filter(bm => bm.id !== memberId))
  }

  const addInstrument = async (memberId: string, instrument: Instrument) => {
    setBandMembers(bandMembers.map(bm => {
      if (bm.id === memberId) {
        return { ...bm, instruments: [...bm.instruments, instrument] }
      }
      return bm
    }))
  }

  const removeInstrument = async (memberId: string, instrument: Instrument) => {
    setBandMembers(bandMembers.map(bm => {
      if (bm.id === memberId) {
        return { ...bm, instruments: bm.instruments.filter(i => i !== instrument) }
      }
      return bm
    }))
  }

  const availableInstruments = (bandMember: GroupMember) => {
    const memberOption = memberOptions.find(m => m.id === bandMember.id);
    const memberInstruments = memberOption?.instruments || [];

    const allInstruments = Object.values(Instrument);
    const unassignedInstruments = allInstruments.filter(i => !bandMember.instruments.includes(i));

    return unassignedInstruments.sort((a, b) => {
      const aIsMemberInstrument = memberInstruments.includes(a);
      const bIsMemberInstrument = memberInstruments.includes(b);

      if (aIsMemberInstrument && !bIsMemberInstrument) return -1;
      if (!aIsMemberInstrument && bIsMemberInstrument) return 1;
      return 0;
    });
  }

  const availableMembers = useMemo(() => {
    return memberOptions
      .filter(m => !bandMembers.some(bm => bm.id === m.id))
      .filter(m => m.id != null);
  }, [memberOptions, bandMembers]);

  const isFormValid = useMemo(() => {
    if (name.trim() === '') return false;
    if (bandMembers.length === 0) return false;
    if (bandMembers.length < 2) return false;
    if (bandMembers.some(member => member.instruments.length === 0)) return false;
    if (!isAdminMode && !bandMembers.some(member => member.id === user?.id)) return false;
    return true;
  }, [name, bandMembers, user?.id, isAdminMode]);

  const validationChecks = useMemo(() => {
    return {
      hasName: name.trim() !== '',
      hasMembers: bandMembers.length > 0,
      hasMultipleMembers: bandMembers.length >= 2,
      allMembersHaveInstruments: bandMembers.length > 0 && !bandMembers.some(member => member.instruments.length === 0),
      includesSelf: bandMembers.some(member => member.id === user?.id) || isMain === 'main'
    };
  }, [name, bandMembers, user?.id, isMain]);

  return (
    <Dialog open={isOpen} onOpenChange={onDialogClose}>
      <DialogContent className="p-5">
        <DialogHeader>
          <DialogTitle>{band ? 'バンドを更新' : 'バンドを作成'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="バンド名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {isAdminMode && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">バンド種類</Label>
              <RadioGroup value={isMain} onValueChange={setIsMain}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="main" id="type-main" />
                  <Label htmlFor="type-main" className="font-normal cursor-pointer">
                    本バンド
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="free" id="type-free" />
                  <Label htmlFor="type-free" className="font-normal cursor-pointer">
                    自由バンド
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
          <div className="space-y-2">
            <h3 className="font-medium">メンバー</h3>
            {bandMembers.map((bandMember, index) => {
              const memberOption = memberOptions.find(m => m.id === bandMember.id);
              return (
                <div key={`${bandMember.id}-${index}`} className="flex items-center space-x-2 p-2 border rounded">
                  <span className="flex-grow">{memberOption?.name}</span>
                  <div className="flex items-center space-x-1">
                    {bandMember.instruments.map((instrument) => (
                      <Badge
                        key={instrument}
                        variant="secondary"
                        className={`text-sm ${instrumentColors[instrument as Instrument]}`}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 mr-1 p-0 hover:bg-transparent"
                          onClick={() => removeInstrument(bandMember.id, instrument as Instrument)}
                        >
                          <X className="h-2 w-2 p-0" />
                        </Button>
                        {instrumentNames[instrument as Instrument]}
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
                          onClick={() => addInstrument(bandMember.id, instrument as Instrument)}
                        >
                          {instrumentNames[instrument as Instrument]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="icon" onClick={() => removeMember(bandMember.id)}>
                    <UserRoundMinus className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
            <div className="space-y-1 pl-2">
              <div className="flex items-center space-x-2 text-sm">
                {validationChecks.hasName ? (
                  <CircleCheckBig className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className={validationChecks.hasName ? "text-green-600" : "text-red-600"}>
                  {validationChecks.hasName ? "バンド名が入力されています" : "バンド名を入力してください"}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                {validationChecks.hasMembers ? (
                  <CircleCheckBig className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className={validationChecks.hasMembers ? "text-green-600" : "text-red-600"}>
                  {validationChecks.hasMembers ? "メンバーが追加されています" : "メンバーを1人以上追加してください"}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                {validationChecks.hasMultipleMembers ? (
                  <CircleCheckBig className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className={validationChecks.hasMultipleMembers ? "text-green-600" : "text-red-600"}>
                  {validationChecks.hasMultipleMembers ? "メンバーが2人以上います" : "メンバーを2人以上追加してください"}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                {validationChecks.allMembersHaveInstruments ? (
                  <CircleCheckBig className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className={validationChecks.allMembersHaveInstruments ? "text-green-600" : "text-red-600"}>
                  {validationChecks.allMembersHaveInstruments ? "全メンバーに楽器が割り当てられています" : "全メンバーに楽器を割り当ててください"}
                </span>
              </div>
              {!isAdminMode && (
                <div className="flex items-center space-x-2 text-sm">
                  {validationChecks.includesSelf ? (
                    <CircleCheckBig className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className={validationChecks.includesSelf ? "text-green-600" : "text-red-600"}>
                    {validationChecks.includesSelf ? "自分がメンバーに含まれています" : "自分をメンバーに追加してください"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    メンバーを追加 <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-[200px] overflow-y-auto">
                  {availableMembers.map((memberOption) => (
                    <DropdownMenuItem
                      key={memberOption.id}
                      onClick={() => addMember(memberOption.id)}
                    >
                      {memberOption.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <LoadingButton onClick={handleSubmit} isLoading={isPending} disabled={!isFormValid}>
                {band ? '保存' : '作成'}
              </LoadingButton>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

