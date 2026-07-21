"use client"

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BandCard } from "./band-card"
import { BandForm } from "./band-form"
import { Group } from "@/app/types"
import { apiClient } from '@/lib/api'
import { BandPageHeader } from '@/components/band-page-header'
import { formatGroups } from '@/lib/utils'
import { toast } from 'sonner'
import { translateError } from '@/lib/error-label'
import { useAdminMode } from '@/hooks/use-admin-mode'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const stripStudentNumberPrefix = (name: string) => name.replace(/^[A-Z0-9]{6}\s+/, '')
type MemberOption = { id: string; name: string; display_name?: string; real_name?: string; instruments: string[] }

export function BandList() {
  const router = useRouter()
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBand, setEditingBand] = useState<Group | undefined>()
  const [isAdminMode, setIsAdminMode] = useAdminMode(isUserAdmin)
  const [bands, setBands] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [deletingBand, setDeletingBand] = useState<Group | null>(null)
  const [deletingBands, setDeletingBands] = useState<Group[]>([])
  const [selectedBandIds, setSelectedBandIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const placeholderMain: Group = { id: 'placeholder-main', name: '', isMain: true, isActive: true, assignments: [] }
  const placeholderFree: Group = { id: 'placeholder-free', name: '', isMain: false, isActive: true, assignments: [] }

  const fetchBandsAndMembers = useCallback(async (adminFlag: boolean) => {
    try {
      setLoading(true)
      const [groupsRes, membersRes] = await Promise.all([
        apiClient.getUserGroups(adminFlag),
        apiClient.getMemberOptions(),
      ])
      if (groupsRes.success) setBands(formatGroups(groupsRes.data || []))
      if (membersRes.success) {
        setMemberOptions((membersRes.data || []).map((member) => ({
          ...member,
          name: stripStudentNumberPrefix(member.display_name || member.name),
        })))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBandsAndMembers(isAdminMode)
    if (!isAdminMode) setSelectedBandIds(new Set())
  }, [fetchBandsAndMembers, isAdminMode])

  const handleEdit = (id: string) => {
    const band = bands.find(b => b.id === id)
    if (band) {
      setEditingBand(band)
      setIsFormOpen(true)
    }
  }

  const handleToggleActive = async (id: string) => {
    const band = bands.find(b => b.id === id)
    if (!band) return
    
    try {
      const response = await apiClient.updateGroup(id, {
        name: band.name,
        is_main: band.isMain,
        is_active: !band.isActive,
        assignments: JSON.stringify(band.assignments.reduce((acc, member) => {
          member.instruments.forEach(instrument => {
            if (!acc[instrument]) {
              acc[instrument] = []
            }
            acc[instrument].push(member.id)
          })
          return acc
        }, {} as Record<string, string[]>))
      })
      
      if (response.success) {
        setBands(prev => prev.map(g => g.id === id ? { ...g, isActive: !band.isActive } : g))
      }
    } catch (error) {
      console.error('Error toggling band active status:', error)
    }
  }

  const handleAdd = () => {
    setEditingBand(undefined)
    setIsFormOpen(true)
  }

  const handleOpenMainDraft = async () => {
    try {
      const response = await apiClient.createBandMainDraft()
      if (response.success && response.data?.shareToken) {
        router.push(`/band/main/draft/${response.data.shareToken}`)
        return
      }
      toast.error('本バンド決めを作成できませんでした', {
        description: response.error ? translateError(response.error) : undefined,
      })
    } catch (error) {
      toast.error('本バンド決めを作成できませんでした', {
        description: translateError((error as Error).message),
      })
    }
  }

  const handleSuccess = async () => {
    await fetchBandsAndMembers(isAdminMode)
  }

  const handleRefresh = async () => {
    try {
      const response = await apiClient.getUserGroups(isAdminMode)
      if (response.success) {
        setBands(formatGroups(response.data || []))
      }
    } catch (error) {
      console.error('Failed to refresh groups:', error)
    }
  }

  const handleAdminToggle = async (checked: boolean) => {
    setIsAdminMode(checked)
  }

  const handleDeleteConfirm = async () => {
    const targets = deletingBands.length > 0 ? deletingBands : deletingBand ? [deletingBand] : []
    if (targets.length === 0 || isDeleting) return

    try {
      setIsDeleting(true)
      const response = targets.length === 1
        ? await apiClient.deleteGroup(targets[0].id)
        : await apiClient.deleteGroups({ ids: targets.map(band => band.id) })
      if (!response.success) {
        toast.error('バンドを削除できませんでした', {
          description: response.error ? translateError(response.error) : undefined,
        })
        return
      }

      const deletedIds = new Set(targets.map(band => band.id))
      setBands(prev => prev.filter(band => !deletedIds.has(band.id)))
      setSelectedBandIds(prev => new Set([...prev].filter(id => !deletedIds.has(id))))
      setDeletingBand(null)
      setDeletingBands([])
      toast.success(targets.length === 1 ? 'バンドを完全に削除しました' : `${targets.length}件のバンドを完全に削除しました`)
    } catch (error) {
      toast.error('バンドを削除できませんでした', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <BandPageHeader 
        onAddBand={handleAdd}
        onOpenMainDraft={handleOpenMainDraft}
        onRefresh={handleRefresh}
        onAdminToggle={handleAdminToggle}
        isAdminMode={isAdminMode}
      />
      <div className="p-3 sm:p-4">
        {!loading && isAdminMode && bands.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedBandIds.size === bands.length ? true : selectedBandIds.size > 0 ? 'indeterminate' : false}
                onCheckedChange={(checked) => setSelectedBandIds(checked === true ? new Set(bands.map(band => band.id)) : new Set())}
                aria-label="すべてのバンドを選択"
              />
              {selectedBandIds.size > 0 ? `${selectedBandIds.size}件選択中` : 'すべて選択'}
            </label>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedBandIds.size === 0}
              onClick={() => setDeletingBands(bands.filter(band => selectedBandIds.has(band.id)))}
            >
              選択したバンドを完全に削除
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {loading ? (
            <>
              <div className="min-w-0">
                <BandCard
                  band={placeholderMain}
                  memberOptions={[]}
                  onEdit={() => {}}
                  isAdminMode={isAdminMode}
                  loading={true}
                />
              </div>
              <div className="min-w-0">
                <BandCard
                  band={placeholderFree}
                  memberOptions={[]}
                  onEdit={() => {}}
                  isAdminMode={isAdminMode}
                  loading={true}
                />
              </div>
            </>
          ) : (
            bands.map((band) => (
              <div className="min-w-0" key={band.id}>
                <BandCard
                  band={band}
                  memberOptions={memberOptions}
                  onEdit={handleEdit}
                  onToggleActive={handleToggleActive}
                  onDelete={isAdminMode ? (id) => setDeletingBand(bands.find(b => b.id === id) || null) : undefined}
                  isSelected={selectedBandIds.has(band.id)}
                  onSelectionChange={isAdminMode ? (id, selected) => setSelectedBandIds(prev => {
                    const next = new Set(prev)
                    if (selected) next.add(id)
                    else next.delete(id)
                    return next
                  }) : undefined}
                  isAdminMode={isAdminMode}
                />
              </div>
            ))
          )}
        </div>
        <BandForm
          band={editingBand}
          memberOptions={memberOptions}
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={handleSuccess}
          isAdminMode={isAdminMode}
        />
        <Dialog open={deletingBand !== null || deletingBands.length > 0} onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeletingBand(null)
            setDeletingBands([])
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>バンドを完全に削除</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4 text-sm text-muted-foreground">
              <p>
                {deletingBands.length > 0
                  ? <><strong className="text-foreground">選択した{deletingBands.length}件のバンド</strong>を削除しますか？</>
                  : <><strong className="text-foreground">{deletingBand?.name}</strong> を削除しますか？</>}
              </p>
              <p>関連する予約、外部スタジオ予約、イベント出演、セットリスト、メンバー情報も削除されます。この操作は取り消せません。</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeletingBand(null); setDeletingBands([]) }} disabled={isDeleting}>
                キャンセル
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
                {isDeleting ? '削除中...' : '完全に削除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
