"use client";

import React, { useEffect, useMemo, useState, useTransition, useCallback } from 'react';
import type { Archive } from '@/lib/schemas';
import { LoadingButton } from '@/components/ui/loading-button'
import { PageHeader } from '@/components/page-header';
import { ArchiveAddDialog } from '@/components/archive-add-dialog';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '@shared-schemas';
import { apiClient } from '@/lib/api'
import { getYoutubeId, isYoutubePlaylist } from './youtube';

export default function Page() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [isPending, startTransition] = useTransition();
  const { user } = useAuth();

  const fetchArchives = useCallback(async () => {
    const res = await apiClient.getArchives()
    if (res.success && res.data) setArchives(res.data)
  }, [])

  useEffect(() => {
    fetchArchives()
  }, [fetchArchives])

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
    startTransition(async () => {
      try {
        const res = await apiClient.deleteArchive(id);
        if (res.success) {
          setArchives((prev) => prev.filter((a) => a.id !== id));
        }
      } catch (error) {
        console.error('Failed to delete archive:', error);
      }
    });
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
        {grouped.map(({ year, list }, index) => (
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
                    <div className="flex gap-2">
                      <LoadingButton
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(a.id)}
                        isLoading={isPending}
                      >
                        削除
                      </LoadingButton>
                    </div>
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
