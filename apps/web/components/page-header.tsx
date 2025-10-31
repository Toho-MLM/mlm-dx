'use client'

import React from 'react';
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useTitle } from '@/app/context/TitleContext';

interface PageHeaderProps {
  rightActions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ rightActions, className = "" }: PageHeaderProps) {
  const { title } = useTitle();

  return (
    <div className={`w-full sticky top-0 bg-gray-100 p-3 z-10 flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <SidebarTrigger />
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      {rightActions && (
        <div className="flex items-center gap-2">
          {rightActions}
        </div>
      )}
    </div>
  );
}
