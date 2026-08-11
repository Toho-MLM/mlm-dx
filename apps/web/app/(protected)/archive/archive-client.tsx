"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Archive } from '@/lib/schemas';
import { LoadingButton } from '@/components/ui/loading-button'
import { PageHeader } from '@/components/page-header';
import { ArchiveAddDialog } from '@/components/archive-add-dialog';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '@shared-schemas';
import { apiClient } from '@/lib/api'
import { getYoutubeId, isYoutubePlaylist } from './youtube';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

export function ArchiveClient({ initialArchives }: { initialArchives?: Archive[] | null }) {
  const [archives, setArchives] = useState<Archive[]>(initialArchives ?? []);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialArchives === undefined || initialArchives === null);
  const [error, setError] = useState<string | null>(initialArchives === null ? 'アーカイブを読み込めませんでした。' : null);
  const { user } = useAuth();

  const fetchArchives = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiClient.getArchives()
      if (!res.success) throw new Error(res.error || 'ARCHIVE_FETCH_FAILED')
      setArchives(res.data || [])
    } catch {
      setError('アーカイブを読み込めませんでした。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialArchives !== undefined && initialArchives !== null) return
    fetchArchives()
  }, [fetchArchives, initialArchives])

  const grouped = useMemo(() => {
    const byYear: Record<number, Archive[]> = {};
    for (const a of archives) {
      if (!byYear[a.year]) byYear[a.year] = [];
      byYear[a.year].push(a);
    }
    return Object.entries(byYear)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([y, list]) => ({ year: Number(y), list }));
  }, [archives]);

  const handleArchiveAdded = () => {
    fetchArchives()
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    try {
      setDeletingId(id);
      const res = await apiClient.deleteArchive(id);
      if (!res.success) throw new Error(res.error || 'ARCHIVE_DELETE_FAILED');
      setArchives((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      toast.error('アーカイブを削除できませんでした', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const canAddArchive = user && user.role && isAdmin(user.role);

  const getEmbedUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;

    if (isYoutubePlaylist(url)) {
      const match = url.match(/[&?]list=([^&]+)/i);
      if (match) {
        return `https://www.youtube.com/embed/videoseries?list=${match[1]}`;
      }
    }

    const videoId = getYoutubeId(url);
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }

    return null;
  };

  return (
    <>
      <PageHeader rightActions={canAddArchive ? <ArchiveAddDialog onArchiveAdded={handleArchiveAdded} /> : undefined} />
      <div className="p-4 pt-0 mx-auto">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="aspect-video w-full" />)}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/50 bg-white p-4 text-sm text-destructive">
            {error}
            <button className="ml-3 underline" onClick={() => void fetchArchives()}>再読み込み</button>
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-md border bg-white p-6 text-center text-sm text-muted-foreground">
            アーカイブはありません。
          </div>
        ) : grouped.map(({ year, list }, index) => (
          <div key={year} className={index > 0 ? "mt-4" : ""}>
            <h2 className="text-2xl font-semibold mb-4">{year}</h2>
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => {
                const embedUrl = getEmbedUrl(a.youtube_url);
                return (
                <li key={a.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="aspect-[16/9]">
                    {embedUrl ? (
                      <iframe
                        src={embedUrl}
                        title={a.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center">No Video</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-xl font-semibold mb-2 text-gray-800">{a.title}</h3>
                    {canAddArchive && <div className="flex gap-2">
                      <LoadingButton
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(a.id)}
                        isLoading={deletingId === a.id}
                        disabled={deletingId !== null}
                      >
                        削除
                      </LoadingButton>
                    </div>}
                  </div>
                </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
