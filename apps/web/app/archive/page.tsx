"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';

type Archive = {
  id: string;
  title: string;
  youtube_url?: string;
  year: number;
  created_at: string;
  updated_at: string;
};

export default function Page() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.getArchives();
        if (mounted && res.success) setArchives(res.data as Archive[]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiClient.createArchive({ title: title.trim(), youtube_url: youtubeUrl.trim() || undefined, year });
      if (res.success && res.data) {
        setArchives((prev) => [res.data as Archive, ...prev]);
        setTitle('');
        setYoutubeUrl('');
        setYear(new Date().getFullYear());
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await apiClient.deleteArchive(id);
    setArchives((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">アーカイブ</h1>

      <form onSubmit={handleCreate} className="mb-8 grid gap-4 md:grid-cols-4">
        <input
          className="border rounded px-3 py-2"
          placeholder="タイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="YouTube URL (任意)"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          type="number"
          placeholder="年"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
          disabled={submitting}
        >追加</button>
      </form>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ year, list }) => (
            <div key={year}>
              <h2 className="text-2xl font-semibold mb-4">{year}</h2>
              <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {list.map((a) => (
                  <li key={a.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="aspect-w-16 aspect-h-9">
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
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm"
                          onClick={() => handleDelete(a.id)}
                        >削除</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}