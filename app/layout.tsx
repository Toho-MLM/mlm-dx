'use client'

import { useEffect } from 'react';
import { AuthProvider } from "./context/AuthContext";
import { Analytics } from '@vercel/analytics/react';
import localFont from "next/font/local";
import "./globals.css";

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
  useEffect(() => {
    // クライアントサイドでのみ supabaseDebug.js を読み込む
    import('../supabase/supabaseDebug.js');
  }, []);

  return (
    <AuthProvider>
      <html lang="ja">
        <body className={`${notoSansJP.variable} antialiased bg-gray-100`}>
          {children}
          <Analytics />
        </body>
      </html>
    </AuthProvider>
  );
}
