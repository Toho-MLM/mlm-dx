'use client'

import { useEffect } from 'react';
import { AuthProvider } from "./context/AuthContext";
import { Analytics } from '@vercel/analytics/react';
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import localFont from "next/font/local";
import "./globals.css";
import { usePathname } from 'next/navigation';
import { TitleProvider, useTitle } from './context/TitleContext';

const notoSansJP = localFont({
  src: "./fonts/NotoSansJP-VariableFont_wght.ttf",
  variable: "--font-noto-sans-jp",
  weight: "100 900",
});

function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { title } = useTitle();

  const shouldHideSidebar = pathname === "/" || pathname === "/login";

  useEffect(() => {
    // クライアントサイドでのみ supabaseDebug.js を読み込む
    import('../supabase/supabaseDebug.js');
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
        <AuthProvider>
          {children}
        </AuthProvider>
      </div>
    </SidebarProvider>
  )
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} antialiased bg-gray-100`}>
        <TitleProvider>
          <MainContent>
            {children}
          </MainContent>
          <Analytics />
        </TitleProvider>
      </body>
    </html>
  );
}
