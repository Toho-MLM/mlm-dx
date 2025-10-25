'use client'

import { useState } from 'react'
import { BandCard } from "./band-card"
import { BandForm } from "./band-form"
import { Button } from "@/components/ui/button"
import { Group, Member } from "@/app/types"
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { BandPageHeader } from '@/components/band-page-header'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '../../../../lib/shared-schemas'

export function BandList({ bands, memberOptions }: { bands: Group[], memberOptions: { id: string; name: string; instruments: string[] }[] }) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBand, setEditingBand] = useState<Group | undefined>()
  const [isAdminMode, setIsAdminMode] = useState(false)
  const router = useRouter()
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)

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
        router.refresh()
      }
    } catch (error) {
      console.error('Error toggling band active status:', error)
    }
  }

  const handleAdd = () => {
    setEditingBand(undefined)
    setIsFormOpen(true)
  }

  const handleSuccess = () => {
    router.refresh()
  }

  const handleRefresh = async () => {
    try {
      const response = await apiClient.getUserGroups(!!isUserAdmin)
      if (response.success) {
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to refresh groups:', error)
      router.refresh()
    }
  }

  const handleAdminToggle = async (checked: boolean) => {
    setIsAdminMode(checked)
    try {
      const response = await apiClient.getUserGroups(checked)
      if (response.success) {
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to refresh groups:', error)
      router.refresh()
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
        {bands.map((band) => (
          <div className="flex justify-center" key={band.id}>
            <BandCard
              band={band}
              memberOptions={memberOptions}
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
            />
          </div>
        ))}
      </div>
      <BandForm
        band={editingBand}
        memberOptions={memberOptions}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={handleSuccess}
      />
      </div>
    </>
  )
}

