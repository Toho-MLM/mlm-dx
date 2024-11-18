'use client';

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MemberList } from './member-list'
import { MemberData } from '@/app/types'
import { supabase } from '@/supabase/supabaseClient'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/ui/loading';
import { Card, CardHeader } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function Page() {
  const [memberData, setMemberData] = useState<MemberData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    const fetchUserData = async () => {
      if (!user?.email) {
        setError('メンバー情報が取得できません。');
        setLoading(false);
        return;
      }

      setLoading(true)
      setError(null)

      try {
        const { data, error } = await supabase.rpc('fetch_member');

        if (error) {
          setError('データの取得中にエラーが発生しました。' + error.message);
        } else if ('error' in data) {
          setError('データの処理中にエラーが発生しました。' + data.error);
        } else if (data === null) {
          setError('メンバーデータが取得できませんでした。');
        } else {
          setMemberData(data as [MemberData]);
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
          <CardHeader className="flex flex-col items-center">
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <span className="mt-2 text-lg text-red-600 text-center">{error}</span>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (memberData) {
    return <MemberList memberData={memberData} />
  }

  return null
}
