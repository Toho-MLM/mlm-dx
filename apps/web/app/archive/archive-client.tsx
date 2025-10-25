'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { createArchiveAction, deleteArchiveAction } from '@/lib/server-actions';
import type { Archive } from '@/lib/schemas';
import { PageHeader } from '@/components/page-header';

interface ArchiveClientProps {
  initialArchives: Archive[];
}

export function ArchiveClient({ initialArchives }: ArchiveClientProps) {
  const [archives, setArchives] = useState<Archive[]>(initialArchives);
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [isPending, startTransition] = useTransition();

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    startTransition(async () => {
      try {
        const res = await createArchiveAction({ 
          title: title.trim(), 
          youtube_url: youtubeUrl.trim() || undefined, 
          year 
        });
        
        if (res.success && res.data) {
          setArchives((prev) => [res.data!, ...prev]);
          setTitle('');
          setYoutubeUrl('');
          setYear(new Date().getFullYear());
        }
      } catch (error) {
        console.error('Failed to create archive:', error);
      }
    });
  };

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      try {
        const res = await deleteArchiveAction(id);
        if (res.success) {
          setArchives((prev) => prev.filter((a) => a.id !== id));
        }
      } catch (error) {
        console.error('Failed to delete archive:', error);
      }
    });
  };

  return (
    <>
      <PageHeader />
      <div className="container mx-auto px-4 py-8">

      <form onSubmit={handleCreate} className="mb-8 grid gap-4 md:grid-cols-4">
        <input
          className="border rounded px-3 py-2"
          placeholder="タイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="YouTube URL (任意)"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          disabled={isPending}
        />
        <input
          className="border rounded px-3 py-2"
          type="number"
          placeholder="年"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          disabled={isPending}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
          disabled={isPending}
        >
          {isPending ? '追加中...' : '追加'}
        </button>
      </form>

      <div className="space-y-8">
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
                      <button
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        onClick={() => handleDelete(a.id)}
                        disabled={isPending}
                      >
                        {isPending ? '削除中...' : '削除'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
