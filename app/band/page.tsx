'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BandList } from './band-list'
import { Group, Member } from '@/app/types'
import { supabase } from '@/supabase/supabaseClient'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/loading';
import ErrorAlert from '@/components/errorAlert';

export default function Page() {
  const [groupData, setGroupData] = useState<Group[] | null>(null)
  const [memberData, setMemberData] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();
  
  // フラグを追加して一度だけ実行
  const hasFetched = useRef(false);

  useEffect(() => {
    if (authLoading) {
      // 認証状態がロード中の場合は何もしない
      return;
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

    hasFetched.current = true;

    const fetchAndSubscribe = async () => {
      setLoading(true);
      setError(null);

      try {
        const [groupResult, memberResult] = await Promise.all([
          supabase.rpc('fetch_user_groups'),
          supabase.rpc('fetch_members')
        ]);

        const { data, error } = groupResult;
        const { data: memberData, error: error2 } = memberResult;

        if (error) {
          setError('データの取得中にエラーが発生しました。' + error.message);
        } else if (error2) {
          setError('データの取得中にエラーが発生しました。' + error2.message);
        } else if (data === null) {
          setError('バンドデータが取得できませんでした。');
        } else if (memberData === null) {
          setError('メンバーデータが取得できませんでした。');
        } else if ('error' in data) {
          setError('データの処理中にエラーが発生しました。' + data.details);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formattedGroupData: Group[] = (data as any[]).map((group) => {
            return {
              id: group.id,
              name: group.name,
              isMain: group.is_main,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              members: group.assignments.map((assignment: any) => ({
                memberId: assignment.member_id,
                instruments: assignment.instrument,
              })),
            };
          });
          setGroupData(formattedGroupData);
          const formattedMemberData = memberData as Member[];
          setMemberData(formattedMemberData);
        }

      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchAndSubscribe();

  }, [user, authLoading, router])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorAlert error={error} />
  }

  if (groupData && memberData) {
    return <BandList bands={groupData} members={memberData} />
  }

  return null
}
