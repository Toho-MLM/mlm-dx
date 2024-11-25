import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { sidebarData } from '@/components/app-sidebar';
interface TitleContextType {
  title: string;
  setTitle: (title: string) => void;
}

const TitleContext = createContext<TitleContextType | undefined>(undefined);

export const TitleProvider = ({ children }: { children: ReactNode }) => {
  const [title, setTitle] = useState('');

  useEffect(() => {
    const { pathname } = window.location;
    const initialTitle = sidebarData.find(group => 
      group.items.some(item => item.href === pathname)
    )?.items.find(item => item.href === pathname)?.text || '';
    setTitle(initialTitle);
  }, []);

  return (
    <TitleContext.Provider value={{ title, setTitle }}>
      {children}
    </TitleContext.Provider>
  );
};

export const useTitle = (): TitleContextType => {
  const context = useContext(TitleContext);
  if (!context) {
    throw new Error("useTitle must be used within a TitleProvider");
  }
  return context;
};
