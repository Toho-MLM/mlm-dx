import React from 'react';

async function fetchUnlistedPlaylists() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
  const res = await fetch(`${base}/api/archive/youtube/playlists`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch playlists');
  const json = await res.json();
  return json?.data || [];
}

export default async function Page() {
  const playlists = await fetchUnlistedPlaylists();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">アーカイブ</h1>
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {playlists.map((p: any) => (
          <li key={p.id} className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="aspect-w-16 aspect-h-9">
              <iframe
                src={`https://www.youtube.com/embed/videoseries?list=${p.id}`}
                title={p.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              ></iframe>
            </div>
            <div className="p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-800">{p.title}</h3>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-block bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 transition-colors">プレイリストを見る</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}