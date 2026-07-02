'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ListChecks, PlusIcon } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '../../../lib/shared-schemas';

interface BandPageHeaderProps {
  onAddBand?: () => void;
  onOpenMainDraft?: () => void;
  onRefresh?: () => void;
  onAdminToggle?: (isAdminMode: boolean) => void;
  isAdminMode?: boolean;
  className?: string;
}

export function BandPageHeader({ onAddBand, onOpenMainDraft, onRefresh, onAdminToggle, isAdminMode = false, className }: BandPageHeaderProps) {
  const { user } = useAuth();
  const isUserAdmin = user && isAdmin(user.role);

  const handleAdminToggle = (checked: boolean) => {
    onAdminToggle?.(checked);
  };

  const rightActions = (
    <div className="flex items-center gap-2">
      {onRefresh && !isUserAdmin && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          更新
        </Button>
      )}
      {isUserAdmin && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">管理者モード</span>
          <Switch checked={isAdminMode} onCheckedChange={handleAdminToggle} />
        </div>
      )}
      {isUserAdmin && isAdminMode && onOpenMainDraft && (
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
