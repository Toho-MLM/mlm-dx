'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { CalendarPlus, CalendarX2, Building2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '../../../lib/shared-schemas';
import { AdminModeToggle } from '@/components/admin-mode-toggle';

interface ReservationPageHeaderProps {
  onAddReservation?: () => void;
  onRefresh?: () => void;
  onCancelReservation?: () => void;
  onAdminToggle?: (isAdminMode: boolean) => void;
  onManageExternal?: () => void;
  isAdminMode?: boolean;
  className?: string;
}

export function ReservationPageHeader({ 
  onAddReservation, 
  onRefresh, 
  onCancelReservation,
  onAdminToggle,
  onManageExternal,
  isAdminMode = false,
  className 
}: ReservationPageHeaderProps) {
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
        <AdminModeToggle checked={isAdminMode} onCheckedChange={handleAdminToggle} />
      )}
      {onCancelReservation && (
        <Button variant="destructive" size="sm" onClick={onCancelReservation}>
          <CalendarX2 className="h-4 w-4" />
          取消
        </Button>
      )}
      {isUserAdmin && isAdminMode && onManageExternal && (
        <Button variant="outline" size="sm" onClick={onManageExternal}>
          <Building2 className="h-4 w-4" />
          外部スタジオ管理
        </Button>
      )}
      {onAddReservation && (
        <Button size="sm" onClick={onAddReservation} className="bg-blue-600 hover:bg-blue-700 text-white">
          <CalendarPlus className="h-4 w-4" />
          予約
        </Button>
      )}
    </div>
  );

  return <PageHeader rightActions={rightActions} className={className} />;
}
