'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { motion } from 'framer-motion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from 'lucide-react'
import { UserData, Instrument } from '@/app/types'

const instrumentNames: Record<Instrument, string> = {
  [Instrument.VOCAL]: 'ボーカル',
  [Instrument.KEYBOARD]: 'キーボード',
  [Instrument.GUITAR]: 'ギター',
  [Instrument.DRUM]: 'ドラム',
  [Instrument.BASS]: 'ベース',
}

const stepVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
}

export function SetupWizard({ name = '山田 太郎', studentId = '12345678', email = 'yamada@example.com' }: { name?: string; studentId?: string; email?: string }) {
  const [step, setStep] = useState(0)
  const [userData, setUserData] = useState<UserData>({
    name: name,
    student_number: studentId,
    email: email,
    nickname: '',
    instruments: [],
  })
  const [canProceed, setCanProceed] = useState(true)

  useEffect(() => {
    if (step === 1) {
      setCanProceed(userData.nickname?.trim() !== '')
    } else if (step === 2) {
      setCanProceed(userData.instruments?.length > 0)
    } else {
      setCanProceed(true)
    }
  }, [step, userData.nickname, userData.instruments])

  const handleNextStep = () => setStep((prev) => prev + 1)
  const handlePrevStep = () => setStep((prev) => prev - 1)

  const updateUserData = (key: keyof UserData, value: string | Instrument[]) => {
    setUserData((prev) => ({ ...prev, [key]: value }))
  }

  const handleInstrumentToggle = (instrument: Instrument) => {
    setUserData((prev) => ({
      ...prev,
      instruments: prev.instruments.includes(instrument)
        ? prev.instruments.filter((i) => i !== instrument)
        : [...prev.instruments, instrument],
    }))
  }

  const steps = [
    // Step 1: 名前と学籍番号の確認
    <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="hidden" transition={{ duration: 0.3 }}>
      <CardContent className="space-y-4 py-4">
        <div className="space-y-2">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-500">名前</p>
            <p className="text-base font-semibold">{userData.name}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-500">学籍番号</p>
            <p className="text-base font-semibold">{userData.student_number}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-500">メールアドレス</p>
            <p className="text-base font-semibold">{userData.email}</p>
          </div>
        </div>
        <Alert className="py-2">
          <InfoIcon className="h-4 w-4 mt-0.5" />
          <AlertDescription className="text-xs ml-2">
            名前、学籍番号、またはメールアドレスが間違っている場合は、管理者にお問い合わせください。
          </AlertDescription>
        </Alert>
      </CardContent>
    </motion.div>,

    // Step 2: ニックネームの設定
    <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="hidden" transition={{ duration: 0.3 }}>
      <CardContent className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="nickname" className="text-sm">ニックネーム</Label>
          <Input
            id="nickname"
            value={userData.nickname || ''}
            onChange={(e) => updateUserData('nickname', e.target.value)}
            className="text-sm"
          />
        </div>
        <Alert variant={canProceed ? "default" : "destructive"} className="py-2">
          <InfoIcon className="h-4 w-4 mt-0.5" />
          <AlertDescription className="text-xs ml-2">
            {canProceed ? "ニックネームを入力してください。" : "ニックネームは必須です。"}
          </AlertDescription>
        </Alert>
      </CardContent>
    </motion.div>,

    // Step 3: 担当楽器の選択
    <motion.div key="step3" variants={stepVariants} initial="hidden" animate="visible" exit="hidden" transition={{ duration: 0.3 }}>
      <CardContent className="space-y-4 py-4">
        <div className="space-y-2">
          <Label className="text-sm">担当楽器（複数選択可）</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(Instrument).map((instrument) => (
              <div key={instrument} className="flex items-center space-x-2">
                <Checkbox
                  id={instrument}
                  checked={userData.instruments?.includes(instrument)}
                  onCheckedChange={() => handleInstrumentToggle(instrument)}
                />
                <Label htmlFor={instrument} className="text-sm">{instrumentNames[instrument]}</Label>
              </div>
            ))}
          </div>
        </div>
        <Alert variant={canProceed ? "default" : "destructive"} className="py-2">
          <InfoIcon className="h-4 w-4 mt-0.5" />
          <AlertDescription className="text-xs ml-2">
            {canProceed ? "担当楽器を1つ以上選択してください。" : "少なくとも1つの楽器を選択してください。"}
          </AlertDescription>
        </Alert>
      </CardContent>
    </motion.div>,

    // Step 4: 確認
    <motion.div key="step4" variants={stepVariants} initial="hidden" animate="visible" exit="hidden" transition={{ duration: 0.3 }}>
      <CardContent className="space-y-3 py-4">
        <div className="space-y-2">
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">名前</p>
            <p className="text-sm font-semibold">{userData.name}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">学籍番号</p>
            <p className="text-sm font-semibold">{userData.student_number}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">メールアドレス</p>
            <p className="text-sm font-semibold">{userData.email}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">ニックネーム</p>
            <p className="text-sm font-semibold">{userData.nickname}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">担当楽器</p>
            <p className="text-sm font-semibold">{userData.instruments?.map((i) => instrumentNames[i]).join(', ') || '未設定'}</p>
          </div>
        </div>
      </CardContent>
    </motion.div>,
  ]

  const handleSubmit = () => {
    console.log('送信されたユーザーデータ:', userData)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full max-w-md mx-auto h-[480px] flex flex-col">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold">セットアップウィザード</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-between px-6 pb-4">
          <div className="flex-grow flex justify-between">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-full h-1 rounded-full mx-0.5 transition-all duration-300 ${
                  index <= step ? 'bg-primary' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <span className="text-sm font-medium text-gray-500 ml-2">
            {step + 1}/{steps.length}
          </span>
        </div>
        <div className="flex-grow overflow-y-auto">
          {steps[step]}
        </div>
        <CardFooter className="flex justify-end pt-4 pb-6">
          {step > 0 && (
            <Button onClick={handlePrevStep} variant="outline" size="sm" className="mr-2">
              戻る
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button onClick={handleNextStep} disabled={!canProceed} size="sm">
              次へ
            </Button>
          ) : (
            <Button onClick={handleSubmit} className="bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
              完了
            </Button>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  )
}