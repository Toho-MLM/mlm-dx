'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { motion } from 'framer-motion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ChevronDown, ChevronUp, InfoIcon, Loader2 } from 'lucide-react'
import { UserData, Instrument, instrumentNames } from '@/app/types'
import { supabase } from '@/supabase/supabaseClient'
import { useRouter } from 'next/navigation'

const stepVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
}

export function SetupWizard(initialUserData: UserData) {
  const [step, setStep] = useState(0)
  const [userData, setUserData] = useState<UserData>(initialUserData)
  const [canProceed, setCanProceed] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter();

  useEffect(() => {
    if (step === 1) {
      setCanProceed(userData.nickname?.trim() !== '')
    } else if (step === 2) {
      setCanProceed(userData.instruments!.length > 0)
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

  const moveInstrument = (index: number, direction: 'up' | 'down') => {
    const newInstruments = [...userData.instruments]
    if (direction === 'up' && index > 0) {
      [newInstruments[index - 1], newInstruments[index]] = [newInstruments[index], newInstruments[index - 1]]
    } else if (direction === 'down' && index < newInstruments.length - 1) {
      [newInstruments[index], newInstruments[index + 1]] = [newInstruments[index + 1], newInstruments[index]]
    }
    setUserData((prev) => ({ ...prev, instruments: newInstruments }))
  }

  const steps = [
    // Step 1: 名前と学籍番号の確認
    <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="hidden" transition={{ duration: 0.3 }}>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="font-medium text-gray-500">設定を確認してください。</p>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-500">メールアドレス</p>
            <p className="text-base font-semibold truncate">{userData.email}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-500">学籍番号</p>
            <p className="text-base font-semibold">{userData.student_number}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-500">学年</p>
            <p className="text-base font-semibold">{userData.grade}年</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-500">氏名</p>
            <p className="text-base font-semibold">{userData.name}</p>
          </div>
        </div>
        <Alert className="flex items-center">
          <AlertTitle>
            <InfoIcon className="h-4 w-4 mr-2" />
          </AlertTitle>
          <AlertDescription>
            いずれかの情報が間違っている場合は、管理者にお問い合わせください。
          </AlertDescription>
        </Alert>
      </CardContent>
    </motion.div>,

    // Step 2: ニックネームの設定
    <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="hidden" transition={{ duration: 0.3 }}>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nickname" className="text-sm">ニックネーム</Label>
          <Input
            id="nickname"
            value={userData.nickname || ''}
            onChange={(e) => updateUserData('nickname', e.target.value)}
            className="text-sm"
          />
        </div>
        <Alert variant={canProceed ? "default" : "destructive"} className="flex items-center">
          <AlertTitle>
            <InfoIcon className="h-4 w-4 mr-2" />
          </AlertTitle>
          <AlertDescription>
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
          <div className="ml-2 grid grid-cols-2 gap-2">
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
        <Alert variant={canProceed ? "default" : "destructive"} className="flex items-center">
          <AlertTitle>
            <InfoIcon className="h-4 w-4 mr-2" />
          </AlertTitle>
          <AlertDescription>
            {canProceed ? "担当楽器を1つ以上選択してください。" + (userData.instruments.length >= 2 ? "優先順位を設定してください。" : "") : "少なくとも1つの楽器を選択してください。"}
          </AlertDescription>
        </Alert>
        {userData.instruments.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            className="space-y-2"
          >
            <Label className="text-sm">優先順位</Label>
            <ul className="space-y-2">
              {userData.instruments.map((instrument, index) => (
                <motion.li
                  key={instrument}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between bg-gray-50 p-2 rounded-lg"
                >
                  <span className="text-sm">{instrumentNames[instrument]}</span>
                  <div className="flex space-x-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => moveInstrument(index, 'up')}
                      disabled={index === 0}
                      className="h-6 w-6"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => moveInstrument(index, 'down')}
                      disabled={index === userData.instruments.length - 1}
                      className="h-6 w-6"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </CardContent>
    </motion.div>,

    // Step 4: 確認
    <motion.div key="step4" variants={stepVariants} initial="hidden" animate="visible" exit="hidden" transition={{ duration: 0.3 }}>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-gray-500">変更内容を確認してください。</p>
        <div className="space-y-2">
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">学籍番号</p>
            <p className="text-sm font-semibold">{userData.student_number}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">氏名</p>
            <p className="text-sm font-semibold">{userData.name}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">ニックネーム</p>
            <p className="text-sm font-semibold">{userData.nickname}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-lg">
            <p className="text-xs font-medium text-gray-500">担当楽器</p>
            <p className="text-sm font-semibold">{userData.instruments.map((i) => instrumentNames[i]).join(', ')}</p>
          </div>
        </div>
        {error && <Alert variant="destructive" className="py-2">
          <InfoIcon className="h-4 w-4 mt-0.5" />
          <AlertDescription className="text-xs ml-2">{error}</AlertDescription>
        </Alert>}
      </CardContent>
    </motion.div>,
  ]

  const handleSubmit = async () => {
    setIsSending(true);
    const instrumentString = userData.instruments.join(',');
    try {
    const { data, error } = await supabase.rpc('update_user', {
      p_email: userData.email,
      p_nickname: userData.nickname,
      p_instruments: instrumentString,
    });
    if (error) {
      setError('データの取得中にエラーが発生しました。' + error.message);
    } else if ('error' in data) {
      setError('データの処理中にエラーが発生しました。' + data.details);
    } else {
      router.push('/profile');
    }
    } catch (err) {
      setError((err as Error).message);
    } finally {
    setIsSending(false);
    }
  };

  return (
    <div className="pt-5 px-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-2xl min-w-fit mx-auto">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold">プロフィール設定</CardTitle>
          </CardHeader>
          <div className="flex items-center justify-between px-6 pb-2">
            <div className="flex-grow flex justify-between">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`w-full h-1 rounded-full mx-0.5 transition-all duration-300 ${index <= step ? 'bg-primary' : 'bg-gray-200'
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
          <CardFooter className="flex justify-end pb-4">
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
              <Button onClick={handleSubmit} className="bg-primary text-primary-foreground hover:bg-primary/90" size="sm" disabled={isSending}>
                <div className="flex items-center justify-center">
                  {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  完了
                </div>
              </Button>
            )}
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  )
}