'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BandList } from './band-list'
import { ReservationData } from '@/app/types'
import { supabase } from '@/supabase/supabaseClient'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/loading';
import ErrorAlert from '@/components/errorAlert';

export default function Page() {
  const [reservationData, setReservationData] = useState<ReservationData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();
  const [userName, setUserName] = useState<string | null>(null)
  
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
        const [reservationsResult, usernameResult] = await Promise.all([
          supabase.rpc('fetch_reservations'),
          supabase.rpc('fetch_user_holder')
        ]);

        const { data, error } = reservationsResult;
        const { data: userData, error: error2 } = usernameResult;

        if (error) {
          setError('データの取得中にエラーが発生しました。' + error.message);
        } else if (error2) {
          setError('データの取得中にエラーが発生しました。' + error2.message);
        } else if (data === null) {
          setError('予約データが取得できませんでした。');
        } else if (userData === null) {
          setError('ユーザーデータが取得できませんでした。');
        } else if ('error' in data) {
          setError('データの処理中にエラーが発生しました。' + data.details);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formattedData: ReservationData[] = (data as any[]).map(item => ({
            ...item,
            start_time: new Date(item.start_time),
            end_time: new Date(item.end_time),
          }));
          setReservationData(formattedData);
          const currentUserName = userData.user.nickname;
          setUserName(currentUserName);
          
          // リアルタイムサブスクリプションの設定
          const channel = supabase
            .channel('reservations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, (payload) => {
              console.log('変更が検出されました:', payload)
              const { eventType, new: newData } = payload

              setReservationData(prev => {
                if (!prev) return prev

                switch(eventType) {
                  case 'INSERT':
                    return [...prev, { 
                      ...newData, 
                      start_time: new Date(newData.start_time), 
                      end_time: new Date(newData.end_time), 
                      creator: (newData.creator === user.id) ? currentUserName : "？" 
                    } as ReservationData]
                  case 'UPDATE':
                    return prev.map(item => item.id === newData.id ? {
                      ...newData,
                      start_time: new Date(newData.start_time),
                      end_time: new Date(newData.end_time),
                      creator: item.creator,
                    } as ReservationData : item)
                  default:
                    return prev
                }
              })
            })
            .subscribe()

          return () => {
            channel.unsubscribe();
          }
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

  if (reservationData && userName) {
    return <BandList bands={[]} members={[]} />
  }

  return null
}
