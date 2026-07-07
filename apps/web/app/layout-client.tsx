'use client'

import React, { Suspense, useEffect } from 'react'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AuthProvider, useAuth } from "./context/AuthContext"
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarFooter } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"
import { getLoginPath } from '@/lib/auth-redirect'

function Content({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading || !user) return
    const userBlocksSidebar = !!user && (!user.nickname || (user.instruments && user.instruments.length === 0))
    if (userBlocksSidebar && pathname !== '/profile') {
      router.replace('/profile')
    }
  }, [loading, user, pathname, router])

  const isAuthResolving = loading || !user
  const isLoginOrRoot = pathname === "/" || pathname === "/login"
  const userBlocksSidebar = !!user && (!user.nickname || (user.instruments && user.instruments.length === 0))
  const shouldRenderSidebarArea = !isLoginOrRoot

  return (
    <>
      {shouldRenderSidebarArea && (
        isAuthResolving ? (
          <Sidebar aria-label="メインナビゲーション">
            <SidebarHeader>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Image src="/assets/logo.png" alt="MLM DX logo" width={32} height={32} style={{ marginRight: '8px', display: 'block' }} />
                <h2 className="text-lg font-semibold">MLM DX</h2>
              </div>
            </SidebarHeader>
            <SidebarContent>
              {[0,1].map((g) => (
                <SidebarGroup key={g}>
                  <SidebarGroupLabel>
                    <Skeleton className="h-4 w-24" />
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {[0,1,2].map(i => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                          <Skeleton className="h-4 w-4 rounded-sm" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
            <SidebarFooter>
              <div className="flex items-center gap-3 p-3">
                <div className="flex items-center gap-3 flex-1 rounded-md p-2 -m-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </SidebarFooter>
          </Sidebar>
        ) : (!userBlocksSidebar && <AppSidebar />)
      )}
      <Suspense fallback={null}>
        <AuthRedirect />
      </Suspense>
      <div className="min-w-0 flex-1">
        {children}
      </div>
      <Toaster />
    </>
  )
}

function AuthRedirect() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.replace(getLoginPath(pathname, searchParams))
    }
  }, [loading, user, router, pathname, searchParams])

  return null
}

export function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Gate>
        <SidebarProvider>
          <Content>{children}</Content>
        </SidebarProvider>
      </Gate>
    </AuthProvider>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
