'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ListChecks, PlusIcon } from 'lucide-react';

interface BandPageHeaderProps {
  onAddBand?: () => void;
  onOpenMainDraft?: () => void;
  onRefresh?: () => void;
  isAdminMode?: boolean;
  className?: string;
}

export function BandPageHeader({
  onAddBand,
  onOpenMainDraft,
  onRefresh,
  isAdminMode = false,
  className,
}: BandPageHeaderProps) {

  const rightActions = (
    <div className="flex items-center gap-2">
      {onRefresh && !isAdminMode && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          更新
        </Button>
      )}
      {isAdminMode && onOpenMainDraft && (
        <Button variant="outline" size="sm" onClick={onOpenMainDraft}>
          <ListChecks className="h-4 w-4" />
          本バンド決め
        </Button>
      )}
      {onAddBand && (
        <Button size="sm" onClick={onAddBand}>
          <PlusIcon className="h-4 w-4" />
          作成
        </Button>
      )}
    </div>
  );

  return <PageHeader rightActions={rightActions} className={className} />;
}
