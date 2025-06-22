'use client'

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircleIcon, CalendarPlusIcon, CalendarX2 } from 'lucide-react';
import { ReservationState, reservationStateColors } from '@/app/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const AboutPage = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // クライアントサイドでのみレンダリング
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-center text-3xl">ホール予約の使い方</CardTitle>
        </CardHeader>
        <CardContent>
          <h3 className="text-lg font-semibold">予約の状態について</h3>
          <div className="ml-1">
            予約には以下の6つの状態があります。
          <ul className="list-disc ml-5">
            <li><Badge className={reservationStateColors[ReservationState.PENDING]}>保留中</Badge>
              <br />予約がまだ確定されていない状態です。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.WITHDRAWN]}>取り下げ</Badge>
              <br />保留中の予約が取り消されるとこの状態になります。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.DECLINED]}>却下</Badge>
              <br />予約が却下された状態です。指定した時間帯が他の予約で埋まっているか、抽選期間に抽選に外れた場合に発生します。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.CONFIRMED]}>確定</Badge>
              <br />予約が確定した状態です。ホールをご利用いただけます。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.CANCELLED]}>キャンセル</Badge>
              <br />確定した予約をユーザーが取り消すとこの状態になります。
            </li>
            <li><Badge className={reservationStateColors[ReservationState.COMPLETED]}>完了</Badge>
              <br />利用が終了するとこの状態になります。
            </li>
          </ul>
          </div>
          <h3 className="mt-4 text-lg font-semibold">予約の作成</h3>
          <ol className="list-decimal list-inside ml-2">
            <li>予約表ページを開く</li>
            <li>右下の <CalendarPlusIcon className="inline-block h-5 w-5 relative left-[-2px] top-[-3px]" />を押す</li>
            <li>必要情報を入力する</li>
            <li>予約の送信</li>
          </ol>
          <p className="ml-2">
            予約が正常に送信されると、カレンダーに追加されます。
          </p>
          <h3 className="mt-4 text-lg font-semibold">予約のキャンセル</h3>
          <ol className="list-decimal list-inside ml-2">
            <li>予約表ページを開く</li>
            <li>キャンセルしたい予約を選択</li>
            <li>右下の <CalendarX2 className="inline-block h-5 w-5 relative left-[-2px] top-[-3px]" />を押す</li>
            <li>内容を確認してキャンセル</li>
          </ol>
          <h3 className="mt-4 text-lg font-semibold">予約の処理</h3>
          <p className="ml-2">
            予約は毎日午前0〜1時の間に処理されます。これにより、前日の予約が完了としてマークされ、当日の予約が処理されます。
          </p>
          <h4 className="text-md font-semibold ml-2">処理の内容</h4>
          <ul className="list-disc ml-6">
            <li>予約に重複がない場合、予約が確定します。</li>
            <li>予約が重複している場合、早く予約された方が優先されます。</li>
            <li>予約が部分的に重複している場合、予約の時間帯内で最大限の時間が確保できるように調整されます。</li>
          </ul>
          <h4 className="text-md font-semibold ml-2">当日の予約について</h4>
          <p className="ml-2">
            午前1時以降に予約をした場合、その予約は即時確定します。既存の予約と重複している場合は、却下されてしまうのでご注意ください。
          </p>
          <h3 className="mt-4 text-lg font-semibold">今後実装予定の機能</h3>
          <ul className="list-disc ml-6">
            <li>団体予約の実装</li>
            <li>予約確定のメールでの通知</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default AboutPage; 