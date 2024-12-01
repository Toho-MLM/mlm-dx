import { Analytics } from '@vercel/analytics/react';
import localFont from "next/font/local";
import "./globals.css";
import { TitleProvider } from './context/TitleContext';
import { Metadata } from 'next';
import { MainContent } from './layout-client';

const notoSansJP = localFont({
  src: "./fonts/NotoSansJP-VariableFont_wght.ttf",
  variable: "--font-noto-sans-jp",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "MLM DX"
};

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

