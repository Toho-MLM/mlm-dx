'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BandList } from './band-list'
import { Group, Member, Instrument } from '@/app/types'
import { apiClient } from '@/lib/api'
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
        const [groupResponse, memberResponse] = await Promise.all([
          apiClient.getUserGroups(),
          apiClient.getMembers()
        ]);

        if (groupResponse.success && memberResponse.success) {
          const formattedGroupData: Group[] = (groupResponse.data as any[]).map((group) => {
            return {
              id: group.id,
              name: group.name,
              isMain: group.is_main,
              assignments: group.assignments ? Object.entries(group.assignments).map(([instrument, userId]) => ({
                id: userId as string,
                instruments: [instrument as Instrument]
              })) : []
            };
          });
          setGroupData(formattedGroupData);
          setMemberData(memberResponse.data as Member[]);
        } else {
          setError('データの取得中にエラーが発生しました。' + (groupResponse.error || memberResponse.error || ''));
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
