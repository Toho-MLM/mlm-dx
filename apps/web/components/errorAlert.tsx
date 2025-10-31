'use client'

import { AlertTriangle } from 'lucide-react'
import React from 'react'
import { Card, CardHeader } from './ui/card'

export default function ErrorAlert({ error }: { error: string }) {
  return (
    <div className="flex items-center justify-center h-screen">
      <Card className="max-w-lg mx-auto flex flex-col items-center">
        <CardHeader className="flex flex-col items-center">
          <AlertTriangle className="h-12 w-12 text-red-500" />
          <span className="mt-2 text-lg text-red-600 text-center">{error}</span>
        </CardHeader>
      </Card>
    </div>
  )
}
