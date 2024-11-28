'use client'

import { useState } from 'react'
import { BandCard } from "./band-card"
import { BandForm } from "./band-form"
import { Button } from "@/components/ui/button"
import { Group, Member } from "@/app/types"

export function BandList({ bands, members }: { bands: Group[], members: Member[] }) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBand, setEditingBand] = useState<Group | undefined>()

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

  return (
    <div className="p-5">
      <div className="grid gap-5 md:grid-cols-2">
        {bands.map((band) => (
          <div className="flex justify-center">
            <BandCard
              key={band.id}
            band={band}
            members={members}
              onEdit={handleEdit}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        <Button onClick={handleAdd} className="mt-5">バンドを追加</Button>
      </div>
      <BandForm
        band={editingBand}
        members={members}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
      />
    </div>
  )
}

