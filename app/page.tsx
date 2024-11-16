'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';

export default function Page() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (user) {
      router.push('/profile');
    }
  }, [user, loading, router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-lg font-semibold">読み込み中...</div>
    </div>
  );
}
