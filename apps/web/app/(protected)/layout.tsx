"use client"

import React from 'react'
import { MainContent } from '../layout-client'

export default function ProtectedLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <MainContent>{children}</MainContent>
    </>
  )
}


