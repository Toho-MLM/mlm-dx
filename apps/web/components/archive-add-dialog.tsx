'use client';

import React, { useState, useTransition } from 'react';
import { createArchiveAction } from '@/lib/server-actions';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ArchiveAddDialogProps {
  onArchiveAdded: (archive: any) => void;
}

export function ArchiveAddDialog({ onArchiveAdded }: ArchiveAddDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [isPending, startTransition] = useTransition();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !youtubeUrl.trim()) return;
    
    startTransition(async () => {
      try {
        const res = await createArchiveAction({ 
          title: title.trim(), 
          youtube_url: youtubeUrl.trim(), 
          year 
        });
        
        if (res.success && res.data) {
          onArchiveAdded(res.data);
          setTitle('');
          setYoutubeUrl('');
          setYear(new Date().getFullYear());
          setOpen(false);
        }
      } catch (error) {
        console.error('Failed to create archive:', error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>追加</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>アーカイブを作成</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">タイトル</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="youtubeUrl">YouTube URL</Label>
            <Input
              id="youtubeUrl"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              disabled={isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">年</Label>
            <Input
              id="year"
              type="number"
              placeholder="年"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={isPending}
              required
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <LoadingButton type="submit" isLoading={isPending}>
              作成
            </LoadingButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
