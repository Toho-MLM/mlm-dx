'use client'

import React from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import type { User } from '@/app/types'

function Content({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const shouldHideSidebar = 
    pathname === "/" || 
    pathname === "/login" || 
    !user ||
    !user.nickname ||
    (user.instruments && user.instruments.length === 0);

  return (
    <>
      {!shouldHideSidebar && <AppSidebar />}
      <div className="w-full">
        {children}
      </div>
    </>
  );
}

export function MainContent({ 
  children, 
  initialUser 
}: { 
  children: React.ReactNode;
  initialUser: User | null;
}) {
  return (
    <AuthProvider initialUser={initialUser}>
      <SidebarProvider>
        <Content>{children}</Content>
      </SidebarProvider>
    </AuthProvider>
  )
}