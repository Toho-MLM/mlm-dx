"use client";

import React, { useState } from 'react';
import { apiClient } from '@/lib/api'
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface ArchiveAddDialogProps {
  onArchiveAdded: () => void;
}

export function ArchiveAddDialog({ onArchiveAdded }: ArchiveAddDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [isPending, setIsPending] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || !title.trim() || !youtubeUrl.trim()) return;

    try {
      setIsPending(true);
      const res = await apiClient.createArchive({
        title: title.trim(),
        youtube_url: youtubeUrl.trim(),
        year
      });
      if (!res.success) {
        toast.error('アーカイブを作成できませんでした');
        return;
      }
      onArchiveAdded();
      setTitle('');
      setYoutubeUrl('');
      setYear(new Date().getFullYear());
      setOpen(false);
    } catch (error) {
      toast.error('アーカイブを作成できませんでした', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsPending(false);
    }
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
