'use client'

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import { AuthProvider } from "./context/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useTitle } from './context/TitleContext';

export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { title } = useTitle();

  const shouldHideSidebar = pathname === "/" || pathname === "/login";

  useEffect(() => {
    // Supabaseデバッグスクリプトは削除
  }, []);

  return (
    <SidebarProvider>
      {!shouldHideSidebar && <AppSidebar />}
      <div className="w-full">
        {!shouldHideSidebar && 
          <div className="w-full sticky top-0 bg-gray-100 p-3 z-10 flex items-center gap-2">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <SidebarTrigger />
              <h1 className="text-xl font-bold">{title}</h1>
            </div>
          </div>
        }
        <SessionProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </SessionProvider>
      </div>
    </SidebarProvider>
  )
}