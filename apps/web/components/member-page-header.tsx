'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusIcon, UsersIcon } from 'lucide-react';

interface MemberPageHeaderProps {
  onAddMember?: () => void;
  onRefresh?: () => void;
  className?: string;
}

export function MemberPageHeader({ onAddMember, onRefresh, className }: MemberPageHeaderProps) {
  const rightActions = (
    <div className="flex items-center gap-2">
      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          更新
        </Button>
      )}
      {onAddMember && (
        <Button size="sm" onClick={onAddMember}>
          <PlusIcon className="h-4 w-4" />
          メンバー追加
        </Button>
      )}
    </div>
  );

  return <PageHeader rightActions={rightActions} className={className} />;
}
