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
  const [userHolder, setUserHolder] = useState<ReservationHolder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth();

  const hasFetched = useRef(false)

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (hasFetched.current) {
      return;
    }

    hasFetched.current = true

    const fetchReservationData = async () => {
      if (!user?.email) {
        setError('予約情報が取得できません。');
        setLoading(false);
        return;
      }

      setLoading(true)
      setError(null)

      try {
        const [reservationsResponse, userHolderResponse] = await Promise.all([
          apiClient.getReservations(),
          apiClient.getUserHolder()
        ]);
        
        if (reservationsResponse.success && reservationsResponse.data) {
          const formattedData: ReservationData[] = (reservationsResponse.data as any[]).map((item: any) => ({
            ...item,
            start: new Date(item.start_time),
            end: new Date(item.end_time),
          }));
          setReservationData(formattedData);
        } else {
          setError('予約データの取得に失敗しました。' + (reservationsResponse.error || ''));
        }

        if (userHolderResponse.success && userHolderResponse.data) {
          const userHolderData = userHolderResponse.data as any;
          const userName = userHolderData.user.nickname;
          if (userName === null) {
            router.push('/profile')
            return;
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
          setError('ユーザー情報の取得に失敗しました。' + (userHolderResponse.error || ''));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchReservationData();
    }
  }, [user, authLoading, router])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorAlert error={error} />
  }

  if (reservationData && userHolder) {
    return <ReservationPage initialReservationData={reservationData} initialUserHolder={userHolder} />
  }

  return null
}
