'use client'

import { useEffect } from 'react';
import { AuthProvider } from "./context/AuthContext";
import { Analytics } from '@vercel/analytics/react';
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import localFont from "next/font/local";
import "./globals.css";
import { usePathname } from 'next/navigation';

const notoSansJP = localFont({
  src: "./fonts/NotoSansJP-VariableFont_wght.ttf",
  variable: "--font-noto-sans-jp",
  weight: "100 900",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();


  const shouldHideSidebar = pathname == "/" || pathname == "/login";

  useEffect(() => {
    // クライアントサイドでのみ supabaseDebug.js を読み込む
    import('../supabase/supabaseDebug.js');
  }, []);

  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} antialiased`}>
        <SidebarProvider >
          {!shouldHideSidebar && <AppSidebar />}
          <div className="w-full bg-gray-100">
            {!shouldHideSidebar && <SidebarTrigger className="p-6" />}
            <AuthProvider>
              {children}
            </AuthProvider>
          </div>
        </SidebarProvider>
        <Analytics />
      </body>
    </html>
  );
}
