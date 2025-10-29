'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '../../../lib/shared-schemas';

interface EventPageHeaderProps {
  onAddEvent?: () => void;
  onRefresh?: () => void;
  className?: string;
}

export function EventPageHeader({ onAddEvent, onRefresh, className }: EventPageHeaderProps) {
  const { user } = useAuth();
  const isUserAdmin = user && isAdmin(user.role);

  const rightActions = (
    <div className="flex items-center gap-2">
      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          更新
        </Button>
      )}
      {isUserAdmin && onAddEvent && (
        <Button size="sm" onClick={onAddEvent}>
          <PlusIcon className="h-4 w-4" />
          作成
        </Button>
      )}
    </div>
  );

  return <PageHeader rightActions={rightActions} className={className} />;
}

