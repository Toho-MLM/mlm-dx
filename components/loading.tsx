'use client'

import React from 'react'

export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="relative w-24 h-24 animate-spin rounded-full bg-gradient-to-r from-primary via-secondary to-accent">
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-gray-100 rounded-full border-2 border-gray-200"></div>
      </div>
      <div className="text-gray-800 text-xl font-semibold mt-4">
        読み込み中
        <span className="animate-pulse">.</span>
        <span className="animate-pulse animation-delay-100">.</span>
        <span className="animate-pulse animation-delay-200">.</span>
      </div>
    </div>
  )
}