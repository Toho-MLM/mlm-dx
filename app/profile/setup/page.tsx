'use client';

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SetupWizard } from './setup-wizard'
import { UserData } from '@/app/types'
import { supabase } from '@/supabase/supabaseClient'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/loading';
import ErrorAlert from '@/components/errorAlert';

export default function Page() {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        const fetchUserData = async () => {
          setLoading(true)
          setError(null)

          try {
            const { data, error } = await supabase.rpc('fetch_user', { p_email: user.email });

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
      }
    }
  }, [router, user, authLoading])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorAlert error={error} />
  }

  if (userData) {
    return <SetupWizard {...userData} />
  }

  return null
}
