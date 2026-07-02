'use client'

import React from 'react';
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useTitle } from '@/app/context/TitleContext';

interface PageHeaderProps {
  rightActions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ rightActions, className = "" }: PageHeaderProps) {
  const { title, breadcrumbs } = useTitle();
  const items = breadcrumbs.length > 0 ? breadcrumbs : [{ title }];

  return (
    <div className={`w-full sticky top-0 bg-gray-100 h-14 px-3 py-0 z-10 flex items-center justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap overflow-hidden text-base sm:text-lg">
            {items.map((item, index) => {
              const isCurrent = index === items.length - 1;

              return (
                <React.Fragment key={`${item.title}-${index}`}>
                  {index > 0 && <BreadcrumbSeparator className="shrink-0" />}
                  <BreadcrumbItem className="min-w-0">
                    {isCurrent ? (
                      <BreadcrumbPage className="truncate font-bold">
                        {item.title}
                      </BreadcrumbPage>
                    ) : (
                      <span className="truncate font-medium text-muted-foreground">
                        {item.title}
                      </span>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {rightActions && (
        <div className="flex max-w-[65%] shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap">
          {rightActions}
        </div>
      )}
    </div>
  );
}
