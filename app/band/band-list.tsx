'use client'

import { useState } from 'react'
import { BandCard } from "./band-card"
import { BandForm } from "./band-form"
import { Button } from "@/components/ui/button"
import { Group, Member } from "@/app/types"

export function BandList({ bands, members }: { bands: Group[], members: Member[] }) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBand, setEditingBand] = useState<Group | undefined>()
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleEdit = (id: string) => {
    const band = bands.find(b => b.id === id)
    if (band) {
      setEditingBand(band)
      setIsFormOpen(true)
    }
  }

  const handleAdd = () => {
    setEditingBand(undefined)
    setIsFormOpen(true)
  }

  const handleSave = (updatedBand: Omit<Group, 'id'>) => {
    setIsSending(true)
    if (editingBand) {
    //   setBands(bands.map(b => b.id === editingBand.id ? { ...b, ...updatedBand } : b))
    } else {
      const newBand: Group = {
        ...updatedBand,
        id: Math.random().toString(36).substring(2, 9),
        isMain: false
      }
    //   setBands([...bands, newBand])
    }
    setIsFormOpen(false)
    setIsSending(false)
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {bands.map((band) => (
          <BandCard
            key={band.id}
            band={band}
            members={members}
            onEdit={handleEdit}
          />
        ))}
      </div>
      <Button onClick={handleAdd} className="mt-8">バンドを追加</Button>
      <BandForm
        band={editingBand}
        members={members}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
        isSending={isSending}
        errorMessage={errorMessage}
      />
    </div>
  )
}

