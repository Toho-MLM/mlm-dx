import { ReservationPage } from './reservation'
import { ReservationData } from '@/app/types'
import { getServerReservations, getServerUserData } from '@/lib/server-api'
import { redirect } from 'next/navigation'
import ErrorAlert from '@/components/errorAlert';

export default async function Page() {
  const userDataResponse = await getServerUserData()
  if (!userDataResponse.success || !userDataResponse.data) {
    redirect('/login')
  }
  const user = userDataResponse.data
  
  if (!user?.nickname) {
    redirect('/profile')
  }
  
  const reservationsResponse = await getServerReservations();

  if (!reservationsResponse.success || !reservationsResponse.data) {
    return <ErrorAlert error={'予約データの取得中にエラーが発生しました。' + (reservationsResponse.error || '')} />
  }

  // データ変換
  const formattedData: ReservationData[] = (reservationsResponse.data as any[]).map((item: any) => ({
    ...item,
    start: new Date(item.start_time),
    end: new Date(item.end_time),
  }));

  return <ReservationPage initialReservationData={formattedData} />
}
