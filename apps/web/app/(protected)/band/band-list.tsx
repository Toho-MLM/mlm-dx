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

export function BandList() {
  const router = useRouter()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBand, setEditingBand] = useState<Group | undefined>()
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [bands, setBands] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [memberOptions, setMemberOptions] = useState<{ id: string; name: string; instruments: string[] }[]>([])
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
      if (membersRes.success) setMemberOptions(membersRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBandsAndMembers(isAdminMode)
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
    try {
      const response = await apiClient.getUserGroups(checked)
      if (response.success) {
        setBands(formatGroups(response.data || []))
      }
    } catch (error) {
      console.error('Failed to refresh groups:', error)
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
      </div>
    </>
  )
}
