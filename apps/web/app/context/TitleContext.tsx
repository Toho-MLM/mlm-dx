'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { getBreadcrumbItems, getPageTitle, type BreadcrumbItem } from '@/lib/navigation';

interface TitleContextType {
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  breadcrumbs: BreadcrumbItem[];
}

const TitleContext = createContext<TitleContextType | undefined>(undefined);

export const TitleProvider = ({ children }: { children: ReactNode }) => {
  const [title, setTitle] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    const pageTitle = getPageTitle(pathname);
    setTitle(pageTitle);
    setBreadcrumbs(getBreadcrumbItems(pathname));
  }, [pathname]);

  return (
    <TitleContext.Provider value={{ title, setTitle, breadcrumbs }}>
      {children}
    </TitleContext.Provider>
  );
};

export const useTitle = () => {
  const context = useContext(TitleContext);
  if (!context) {
    throw new Error('useTitle must be used within a TitleProvider');
  }
  return context;
};
