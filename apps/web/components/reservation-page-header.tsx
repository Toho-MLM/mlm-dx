'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CalendarPlus, CalendarX2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '../../../lib/shared-schemas';

interface ReservationPageHeaderProps {
  onAddReservation?: () => void;
  onRefresh?: () => void;
  onCancelReservation?: () => void;
  onAdminToggle?: (isAdminMode: boolean) => void;
  className?: string;
}

export function ReservationPageHeader({ 
  onAddReservation, 
  onRefresh, 
  onCancelReservation,
  onAdminToggle,
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">管理者モード</span>
          <Switch onCheckedChange={handleAdminToggle} />
        </div>
      )}
      {onCancelReservation && (
        <Button variant="destructive" size="sm" onClick={onCancelReservation}>
          <CalendarX2 className="h-4 w-4" />
          取消
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
