'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';

interface BandPageHeaderProps {
  onAddBand?: () => void;
  onRefresh?: () => void;
  className?: string;
}

export function BandPageHeader({ onAddBand, onRefresh, className }: BandPageHeaderProps) {
  const rightActions = (
    <div className="flex items-center gap-2">
      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          更新
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
