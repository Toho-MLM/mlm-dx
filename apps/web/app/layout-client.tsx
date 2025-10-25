'use client'

import React from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from "./context/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const shouldHideSidebar = pathname === "/" || pathname === "/login";

  return (
    <AuthProvider>
      <SidebarProvider>
        {!shouldHideSidebar && <AppSidebar />}
        <div className="w-full">
          {children}
        </div>
      </SidebarProvider>
    </AuthProvider>
  )
}