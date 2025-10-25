'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ProfilePage } from './profile-page'
import { SetupWizard } from './setup-wizard'
import { UserData, Role, Instrument } from '@/app/types'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/loading';
import { toast } from 'sonner'
import { translateError } from '@/lib/error-label'

export default function Page() {
  const [userData, setUserData] = useState<UserData | null>(null)
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
      setLoading(true)

      try {
        const response = await apiClient.getCurrentUserData();
        
        if (response.success && response.data) {
          const userData: UserData = {
            grade: response.data.grade,
            name: response.data.name ?? '',
            role: response.data.role as Role,
            email: response.data.email,
            nickname: response.data.nickname,
            instruments: response.data.instruments as Instrument[],
            student_number: response.data.student_number
          };
          setUserData(userData);
        } else {
          toast.error('ユーザーデータの取得に失敗しました', {
            description: translateError(response.error || '')
          })
        }
      } catch (err) {
        toast.error('ユーザーデータの取得中にエラーが発生しました', {
          description: translateError((err as Error).message)
        })
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
