'use client';

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReservationPage } from './reservation'
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

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    const fetchAndSubscribe = async () => {
      if (!user) {
        setError('ユーザー情報が取得できません。');
        setLoading(false);
        return;
      }

      setLoading(true)
      setError(null)

      try {
        // 初回のデータ取得
        const { data, error } = await supabase.rpc('fetch_reservations');

        if (error) {
          setError('データの取得中にエラーが発生しました。' + error.message);
        } else if (data === null) {
          setError('予約データが取得できませんでした。');
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
        }

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
                  return [...prev, { ...newData, start_time: new Date(newData.start_time), end_time: new Date(newData.end_time), creator: (newData.creator === user.id) ? 'New!' : newData.creator } as ReservationData]
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

      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    let unsubscribe: () => void = () => {}
    if (user) {
      const promise = fetchAndSubscribe()
      promise.then(unsub => {
        if (unsub) unsubscribe = unsub
      })
    }

    return () => {
      unsubscribe()
    }
  }, [router, user, authLoading])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorAlert error={error} />
  }

  if (reservationData) {
    return <ReservationPage reservationData={reservationData} />
  }

  return null
}
