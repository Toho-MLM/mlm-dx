'use client';

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserData } from '@/app/types'
import { supabase } from '@/supabaseClient'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/ui/loading';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

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
      if (!user) return;

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

    if (user) {
      fetchUserData();
    }
  }, [router, user, authLoading])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="max-w-lg mx-auto flex flex-col items-center">
          <CardHeader>
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <span className="ml-2 text-lg text-red-600">エラーが発生しました。<br />{error}</span>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (userData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="max-w-lg mx-auto flex flex-col items-center">
          <CardHeader>
            <CheckCircle className="h-12 w-12 text-green-500" />
          </CardHeader>
          <CardContent className="flex justify-center">
            <span className="mt-2 text-lg text-green-600 text-center">ログインに成功しました。<br />このページは閉じてください。</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}