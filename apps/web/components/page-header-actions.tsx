'use client'

import React, { useRef, useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface PageHeaderMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  hidden?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

export type PageHeaderAction =
  | {
      type: 'action';
      id: string;
      content: React.ReactNode;
      hidden?: boolean;
    }
  | {
      type: 'menu';
      id: string;
      label: string;
      items: readonly PageHeaderMenuItem[];
      hidden?: boolean;
      disabled?: boolean;
      variant?: ButtonProps['variant'];
      triggerRef?: React.Ref<HTMLButtonElement>;
    };

export type PageHeaderRightActions = React.ReactNode | readonly PageHeaderAction[];

function isActionList(actions: PageHeaderRightActions): actions is readonly PageHeaderAction[] {
  return Array.isArray(actions) && actions.every(action =>
    action !== null && typeof action === 'object' &&
    'type' in action && (action.type === 'action' || action.type === 'menu') &&
    'id' in action
  );
}

function PageHeaderActionMenu({ action }: { action: Extract<PageHeaderAction, { type: 'menu' }> }) {
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const items = action.items.filter(item => !item.hidden);

  if (items.length === 0) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button ref={action.triggerRef} type="button" variant={action.variant ?? 'outline'} disabled={action.disabled}>
          {action.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] max-w-[calc(100vw-32px)] overflow-y-auto"
        onCloseAutoFocus={() => {
          // Run after the menu unmounts and returns focus to its trigger.
          const callback = pendingAction.current;
          pendingAction.current = null;
          if (callback) requestAnimationFrame(callback);
        }}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {item.separatorBefore && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={item.disabled}
              className={cn(
                'min-h-11 whitespace-normal break-words',
                item.destructive && 'text-destructive focus:text-destructive'
              )}
              onSelect={event => {
                event.preventDefault();
                pendingAction.current = item.onSelect;
                setOpen(false);
              }}
            >
              {item.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageHeaderActions({ actions }: { actions: PageHeaderRightActions }) {
  if (!isActionList(actions)) return <>{actions}</>;

  return <>{actions.filter(action => !action.hidden).map(action => (
    action.type === 'menu'
      ? <PageHeaderActionMenu key={action.id} action={action} />
      : <React.Fragment key={action.id}>{action.content}</React.Fragment>
  ))}</>;
}
