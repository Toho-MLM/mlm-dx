'use client'

import React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { CalendarPlus, CalendarX2 } from 'lucide-react';

interface ReservationPageHeaderProps {
  onAddReservation?: () => void;
  onRefresh?: () => void;
  onCancelReservation?: () => void;
  className?: string;
}

export function ReservationPageHeader({ 
  onAddReservation, 
  onRefresh, 
  onCancelReservation,
  className 
}: ReservationPageHeaderProps) {
  const rightActions = (
    <div className="flex items-center gap-2">
      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          更新
        </Button>
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
