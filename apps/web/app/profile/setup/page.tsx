'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SetupWizard } from './setup-wizard'
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

  // フラグを追加して一度だけ実行
  const hasFetched = useRef(false)

  useEffect(() => {
    if (authLoading) {
      // 認証状態がロード中の場合は何もしない
      return
    }

    if (!user) {
      // ユーザーが存在しない場合はログインページにリダイレクト
      router.push('/login');
      return;
    }

    if (hasFetched.current) {
      // 既にフェッチ済みの場合は何もしない
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
          setUserData(response.data as UserData);
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
    const needsSetup = !userData.nickname || userData.instruments.length === 0
    
    if (needsSetup) {
      return <SetupWizard {...userData} />
    } else {
      router.push('/profile')
      return null
    }
  }

  return null
}
