"use client";

import React, { useEffect, useMemo, useState, useTransition, useCallback } from 'react';
import type { Archive } from '@/lib/schemas';
import { LoadingButton } from '@/components/ui/loading-button'
import { PageHeader } from '@/components/page-header';
import { ArchiveAddDialog } from '@/components/archive-add-dialog';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '@shared-schemas';
import { apiClient } from '@/lib/api'

export function ArchiveClient() {
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

  return (
    <>
      <PageHeader rightActions={canAddArchive ? <ArchiveAddDialog onArchiveAdded={handleArchiveAdded} /> : undefined} />
      <div className="container mx-auto px-4 py-8">
        {grouped.map(({ year, list }) => (
          <div key={year}>
            <h2 className="text-2xl font-semibold mb-4">{year}</h2>
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => (
                <li key={a.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="aspect-[16/9]">
                    {a.youtube_url ? (
                      <iframe
                        src={a.youtube_url.includes('list=') ? `https://www.youtube.com/embed/videoseries?${a.youtube_url.split('?')[1]}` : a.youtube_url}
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
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
