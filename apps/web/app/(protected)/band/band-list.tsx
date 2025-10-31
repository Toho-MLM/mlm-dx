"use client"

import { useEffect, useState, useCallback } from 'react'
import { BandCard } from "./band-card"
import { BandForm } from "./band-form"
import { Group } from "@/app/types"
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { BandPageHeader } from '@/components/band-page-header'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'
import { formatGroups } from '@/lib/utils'

export function BandList() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBand, setEditingBand] = useState<Group | undefined>()
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [bands, setBands] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [memberOptions, setMemberOptions] = useState<{ id: string; name: string; instruments: string[] }[]>([])
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)
  const placeholderMain: Group = { id: 'placeholder-main', name: '', isMain: true, isActive: true, assignments: [] }
  const placeholderFree: Group = { id: 'placeholder-free', name: '', isMain: false, isActive: true, assignments: [] }

  const fetchBandsAndMembers = useCallback(async (adminFlag: boolean) => {
    try {
      setLoading(true)
      const [groupsRes, membersRes] = await Promise.all([
        apiClient.getUserGroups(adminFlag),
        apiClient.getMemberOptions(),
      ])
      if (groupsRes.success) setBands(formatGroups(groupsRes.data as any[]))
      if (membersRes.success) setMemberOptions(membersRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBandsAndMembers(!!isUserAdmin)
  }, [fetchBandsAndMembers, isUserAdmin])

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
            acc[instrument] = member.id
          })
          return acc
        }, {} as Record<string, string>))
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

  const handleSuccess = async () => {
    await fetchBandsAndMembers(isAdminMode)
  }

  const handleRefresh = async () => {
    try {
      const response = await apiClient.getUserGroups(!!isUserAdmin)
      if (response.success) {
        setBands(formatGroups(response.data as any[]))
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
        setBands(formatGroups(response.data as any[]))
      }
    } catch (error) {
      console.error('Failed to refresh groups:', error)
    }
  }

  return (
    <>
      <BandPageHeader 
        onAddBand={handleAdd}
        onRefresh={handleRefresh}
        onAdminToggle={handleAdminToggle}
      />
      <div className="p-5">
      <div className="grid gap-5 md:grid-cols-2">
        {loading ? (
          <>
            <div className="flex justify-center">
              <BandCard
                band={placeholderMain}
                memberOptions={[]}
                onEdit={() => {}}
                isAdminMode={isAdminMode}
                loading={true}
              />
            </div>
            <div className="flex justify-center">
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
            <div className="flex justify-center" key={band.id}>
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

