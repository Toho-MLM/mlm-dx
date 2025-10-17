'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';
import LoadingScreen from '@/components/loading';

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
    <LoadingScreen />
  );
}
