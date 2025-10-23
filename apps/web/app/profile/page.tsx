'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ProfilePage } from './profile-page'
import { SetupWizard } from './setup-wizard'
import { UserData, Role, Instrument } from '@/app/types'
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

  const hasFetched = useRef<string | null>(null)

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (hasFetched.current === user.email) {
      return;
    }

    hasFetched.current = user.email

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
          const userData: UserData = {
            grade: '1', // デフォルト値
            name: response.data.name,
            role: 'MBR' as Role, // デフォルト値
            email: response.data.email,
            nickname: response.data.nickname,
            instruments: response.data.instruments as Instrument[],
            student_number: response.data.student_number
          };
          setUserData(userData);
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

  const handleSetupComplete = (updatedData: UserData) => {
    setUserData(updatedData);
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorAlert error={error} />
  }

  if (userData) {
    const needsSetup = !userData.nickname || userData.instruments.length === 0
    
    if (needsSetup) {
      return <SetupWizard initialUserData={userData} onComplete={handleSetupComplete} />
    } else {
      return <ProfilePage userData={userData} onDataRefresh={handleSetupComplete} />
    }
  }

  return null
}
