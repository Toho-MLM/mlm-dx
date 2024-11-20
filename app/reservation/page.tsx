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

    const fetchUserData = async () => {
      if (!user?.email) {
        setError('ユーザー情報が取得できません。');
        setLoading(false);
        return;
      }

      setLoading(true)
      setError(null)

      try {
        const { data, error } = await supabase.rpc('fetch_reservations');
        console.log("raw:" + JSON.stringify(data));

        if (error) {
          setError('データの取得中にエラーが発生しました。' + error.message);
        } else if (data === null) {
          setError('予約データが取得できませんでした。');
        } else if ('error' in data) {
          setError('データの処理中にエラーが発生しました。' + data.error);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formattedData: ReservationData[] = (data as any[]).map(item => ({
            ...item,
            start_time: new Date(item.start_time),
            end_time: new Date(item.end_time),
          }));
          console.log(formattedData);
          setReservationData(formattedData);
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
    return <ErrorAlert error={error} />
  }

  if (reservationData) {
    return <ReservationPage reservationData={reservationData} />
  }

  return null
}
