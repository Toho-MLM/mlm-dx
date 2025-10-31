'use client'

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircleIcon, CalendarPlusIcon, CalendarX2 } from 'lucide-react';
import { ReservationState, reservationStateColors } from '@/app/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/page-header';

const AboutPage = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // クライアントサイドでのみレンダリング
  }

  return (
    <>
      <PageHeader />
      <div className="p-4 mx-auto">
      <Card className="pt-4">
        <CardContent>
          <h3 className="text-lg font-semibold">予約の状態について</h3>
          <div className="ml-1">
            予約には以下の6つの状態があります。
          <ul className="list-disc ml-5">
            <li><Badge className={reservationStateColors[ReservationState.PENDING]}>保留中</Badge>
              <br />予約が登録された状態です。予約日になるまではこの状態で待機します。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.WITHDRAWN]}>取り下げ</Badge>
              <br />保留中の予約をユーザーが取り消した場合に表示されます。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.DECLINED]}>却下</Badge>
              <br />予約時間が利用可能枠を確保できなかった場合に設定されます（利用可能時間外・重複・全枠埋まりなど）。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.CONFIRMED]}>確定</Badge>
              <br />予約が成立しています。同一日に空き時間が重なっていた場合は、利用可能な範囲に自動調整されたうえで確定します。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.CANCELLED]}>キャンセル</Badge>
              <br />確定済みまたは保留中の予約をユーザーがキャンセルした状態です。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.COMPLETED]}>完了</Badge>
              <br />利用が終了し、運営側で完了として記録された状態です。
            </li>
          </ul>
          </div>
          <h3 className="mt-4 text-lg font-semibold">予約の作成</h3>
          <ol className="list-decimal list-inside ml-2">
            <li>予約表ページを開く</li>
            <li>右下の <CalendarPlusIcon className="inline-block h-5 w-5 relative left-[-2px] top-[-3px]" /> を押す</li>
            <li>利用者（個人 or 所属バンド）、日付、開始・終了時刻を入力する</li>
            <li>内容を確認して送信する</li>
          </ol>
          <p className="ml-2">
            予約は日をまたがず、朝6時から夜11時の間で最短10分・最長4時間まで、かつ2週間先まで登録できます。所属バンド名義で予約する場合は、事前にバンドメンバーとして登録されている必要があります。
          </p>
          <h4 className="text-md font-semibold ml-2 mt-4">当日の予約</h4>
          <p className="ml-2">
            予約日が当日の場合は送信直後に自動判定が行われ、空きがあれば即時 <Badge className={reservationStateColors[ReservationState.CONFIRMED]}>確定</Badge>、空きがなければ <Badge className={reservationStateColors[ReservationState.DECLINED]}>却下</Badge> されます。部分的に空きがある場合は、利用可能な範囲に時間が自動調整されます。
          </p>
          <h4 className="text-md font-semibold ml-2 mt-4">翌日以降の予約</h4>
          <p className="ml-2">
            未来日の予約は一旦 <Badge className={reservationStateColors[ReservationState.PENDING]}>保留中</Badge> として登録され、予約日の午前0時（JST）に実行されるバッチ処理で空き状況を判定します。
          </p>
          <h3 className="mt-4 text-lg font-semibold">予約のキャンセル</h3>
          <ol className="list-decimal list-inside ml-2">
            <li>予約表ページを開く</li>
            <li>キャンセルしたい予約を選択</li>
            <li>右下の <CalendarX2 className="inline-block h-5 w-5 relative left-[-2px] top-[-3px]" /> を押す</li>
            <li>内容を確認してキャンセルする</li>
          </ol>
          <p className="ml-2">
            キャンセルできるのは <Badge className={reservationStateColors[ReservationState.PENDING]}>保留中</Badge> と <Badge className={reservationStateColors[ReservationState.CONFIRMED]}>確定</Badge> の予約のみです。予約者本人に加えて、同じバンドのメンバーもキャンセルできます。
          </p>
          <h3 className="mt-4 text-lg font-semibold">自動処理の流れ</h3>
          <p className="ml-2">
            毎日午前0時（JST）に以下の処理が実行されます。
          </p>
          <ul className="list-disc ml-6">
            <li>当日分の <Badge className={reservationStateColors[ReservationState.PENDING]}>保留中</Badge> 予約を取得し、空き状況を確認します。</li>
            <li>空きがあれば <Badge className={reservationStateColors[ReservationState.CONFIRMED]}>確定</Badge>、空きがなければ <Badge className={reservationStateColors[ReservationState.DECLINED]}>却下</Badge> に更新します。</li>
            <li>空き時間が一部のみの場合は、利用可能な時間帯に自動で短縮したうえで <Badge className={reservationStateColors[ReservationState.CONFIRMED]}>確定</Badge> します。</li>
          </ul>
          <Alert className="mt-4">
            <AlertCircleIcon className="h-4 w-4" />
            <AlertTitle>注意</AlertTitle>
            <AlertDescription>
              予約が <Badge className={reservationStateColors[ReservationState.DECLINED]}>却下</Badge> された場合、時間帯を変更して再度予約してください。自動調整により開始・終了時刻が変更された場合は、予約詳細で更新後の時間を確認できます。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
      </div>
    </>
  );
};

export default AboutPage; 
