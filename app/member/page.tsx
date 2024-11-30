'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MemberList } from './member-list'
import { MemberListItem } from '@/app/types'
import { supabase } from '@/supabase/supabaseClient'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/loading';
import { Card, CardHeader } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function Page() {
  const [memberData, setMemberData] = useState<MemberListItem[] | null>(null)
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
        setError('メンバー情報が取得できません。');
        setLoading(false);
        return;
      }

      setLoading(true)
      setError(null)

      try {
        const { data, error } = await supabase.rpc('fetch_member_list');
        if (error) {
          setError('データの取得中にエラーが発生しました。' + error.message);
        } else if (data === null) {
          setError('名簿データが存在しません。');
        } else if ('error' in data) {
          setError('データの処理中にエラーが発生しました。' + data.details);
        } else {
          setMemberData(data as MemberListItem[]);
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
  }, [user, authLoading, router])

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
