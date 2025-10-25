'use client'

import React from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from "./context/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import type { User } from '@/app/types'

export function MainContent({ 
  children, 
  initialUser 
}: { 
  children: React.ReactNode;
  initialUser: User | null;
}) {
  const pathname = usePathname();

  const shouldHideSidebar = pathname === "/" || pathname === "/login";

  return (
    <AuthProvider initialUser={initialUser}>
      <SidebarProvider>
        {!shouldHideSidebar && <AppSidebar />}
        <div className="w-full">
          {children}
        </div>
      </SidebarProvider>
    </AuthProvider>
  )
}