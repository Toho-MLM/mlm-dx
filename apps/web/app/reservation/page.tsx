'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ReservationPage } from './reservation'
import { ReservationData, ReservationHolder } from '@/app/types'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/app/context/AuthContext';
import LoadingScreen from '@/components/loading';
import ErrorAlert from '@/components/errorAlert';

export default function Page() {
  const [reservationData, setReservationData] = useState<ReservationData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();
  const [userHolder, setUserHolder] = useState<ReservationHolder[] | null>(null)
  
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
        const [reservationsResponse, userHolderResponse] = await Promise.all([
          apiClient.getReservations(),
          apiClient.getUserHolder()
        ]);
        
        if (reservationsResponse.success && userHolderResponse.success) {
          const formattedData: ReservationData[] = (reservationsResponse.data as unknown[]).map(item => ({
            ...item,
            start_time: new Date(item.start_time),
            end_time: new Date(item.end_time),
          }));
          setReservationData(formattedData);
          
          const userHolderData = userHolderResponse.data;
          const userName = userHolderData.user.nickname;
          if (userName === null) {
            router.push('/profile')
          }
          
          const result: ReservationHolder[] = [];
          result.push({
            name: userHolderData.user.nickname,
            id: null
          });
          
          userHolderData.bands.forEach((band: { name: string; id: string }) => {
            result.push({
              name: band.name,
              id: band.id
            });
          });
          setUserHolder(result);
        } else {
          setError('データの取得に失敗しました。' + (reservationsResponse.error || userHolderResponse.error || ''));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchAndSubscribe();

  }, [user, authLoading, router])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorAlert error={error} />
  }

  if (reservationData && userHolder) {
    return <ReservationPage reservationData={reservationData} userHolder={userHolder} />
  }

  return null
}
