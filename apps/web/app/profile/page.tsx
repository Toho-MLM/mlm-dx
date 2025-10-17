'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ProfilePage } from './profile-page'
import { UserData } from '@/app/types'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/loading';
import ErrorAlert from '@/components/errorAlert';

export default function Page() {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();

  const hasFetched = useRef(false)

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (hasFetched.current) {
      return;
    }

    hasFetched.current = true

    const fetchUserData = async () => {
      if (!user?.email) {
        setError('ユーザー情報が取得できません。');
        setLoading(false);
        return;
      }

      setLoading(true)
      setError(null)

      try {
        const response = await apiClient.getUserData(user.email);
        
        if (response.success && response.data) {
          const userData = response.data;
          const hasNullValue = Object.values(userData).some(value => value === null);
          if (hasNullValue) {
            router.push('/profile/setup');
          } else {
            setUserData(userData as UserData);
          }
        } else {
          setError('ユーザーデータの取得に失敗しました。' + (response.error || ''));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [user, authLoading, router])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorAlert error={error} />
  }

  if (userData) {
    return <ProfilePage userData={userData} />
  }

  return null
}
