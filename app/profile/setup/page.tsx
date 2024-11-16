'use client';

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SetupWizard } from './setup-wizard'
import { UserData } from '@/app/types'
import { supabase } from '@/supabaseClient'
import { useAuth } from '@/app/context/AuthContext';

export default function Page() {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }

    const fetchUserData = async () => {
      setLoading(true)
      setError(null)

      try {
        const { data, error } = await supabase.rpc('fetch_user', { p_email: user?.email });

        if (error) {
          setError('データの取得中にエラーが発生しました。' + error.message);
        } else if ('error' in data) {
          setError(data.error);
        } else if (data === null) {
          setError('ユーザーデータが取得できませんでした。');
        } else {
          setUserData(data as UserData);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData()
  }, [router, user, authLoading])

  if (loading) {
    return <div>読み込み中...</div>
  }

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>
  }

  if (userData) {
    return <SetupWizard name={userData.name} studentId={userData.student_number} email={userData.email} />
  }

  return null
}
