'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { AnimatePresence, motion } from 'framer-motion'
import { MemberListItem, instrumentNames, roleNames, instrumentColors } from '@/app/types'
import { PageHeader } from '@/components/page-header'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'
import { apiClient } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { showSuccessToast } from '@/lib/utils'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { PlusIcon, EditIcon, TrashIcon, UploadIcon } from 'lucide-react'


export default function Page() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isWarningDialogOpen, setIsWarningDialogOpen] = useState(false)
  const [isCsvImportDialogOpen, setIsCsvImportDialogOpen] = useState(false)
  const [csvMembers, setCsvMembers] = useState<Array<{ name: string; email: string; grade: number | null; nickname?: string; instruments?: string[]; role?: string; row: number; errors: string[] }>>([])
  const [editingMember, setEditingMember] = useState<MemberListItem | null>(null)
  const [deletingMember, setDeletingMember] = useState<MemberListItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMembers = async () => {
    try {
      setLoading(true)
      const res = await apiClient.getMemberList()
      if (res.success && res.data) {
        setMembers(res.data)
      } else {
        toast.error('メンバーリストの取得に失敗しました')
      }
    } catch {
      toast.error('メンバーリストの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [])

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    grade: 1,
  })

  const [editFormData, setEditFormData] = useState({
    nickname: '',
    instruments: [] as string[],
    role: 'MBR' as string,
  })

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(members)) {
      return []
    }
    return members.filter(user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.nickname && user.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      user.student_number.includes(searchTerm)
    )
  }, [members, searchTerm])

  const existingEmails = useMemo(() => new Set((members || []).map(u => (u.email || '').trim().toLowerCase())), [members])
  const duplicateEmailsInDb = useMemo(() => {
    const emails = csvMembers.map(m => (m.email || '').trim().toLowerCase()).filter(e => e)
    const dup = Array.from(new Set(emails.filter(e => existingEmails.has(e))))
    return dup
  }, [csvMembers, existingEmails])
  const missingRequiredRows = useMemo(() => csvMembers.filter(r => r.errors.includes('REQUIRED_MISSING')), [csvMembers])
  const invalidGradeRows = useMemo(() => csvMembers.filter(r => r.errors.includes('INVALID_GRADE')), [csvMembers])

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      grade: 1,
    })
  }

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('名前とメールアドレスは必須です')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await apiClient.createMember({
        name: formData.name,
        email: formData.email,
        grade: formData.grade,
      })
      if (response.success) {
        showSuccessToast({ message: 'メンバーを作成しました' })
        setIsCreateDialogOpen(false)
        resetForm()
        await fetchMembers()
      } else {
        toast.error('メンバーの作成に失敗しました')
      }
    } catch (error) {
      toast.error('エラーが発生しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (member: MemberListItem) => {
    setEditingMember(member)
    setFormData({
      name: member.name,
      email: member.email,
      grade: member.grade,
    })
    setEditFormData({
      nickname: member.nickname || '',
      instruments: member.instruments,
      role: member.role,
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdate = async () => {
    if (!editingMember) {
      toast.error('編集するメンバーが選択されていません')
      return
    }

    const isEditingSelf = user && editingMember.id === user.id
    const isSettingToMember = editFormData.role === 'MBR'
    const originalRole = editingMember.role

    if (isEditingSelf && isSettingToMember && originalRole !== 'MBR' && isUserAdmin) {
      setIsWarningDialogOpen(true)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await apiClient.updateMember(editingMember.id, {
        nickname: editFormData.nickname,
        grade: formData.grade,
        instruments: editFormData.instruments,
        role: editFormData.role,
      })
      if (response.success) {
        showSuccessToast({ message: 'メンバーを更新しました' })
        setIsEditDialogOpen(false)
        setEditingMember(null)
        resetForm()
        await fetchMembers()
      } else {
        toast.error('メンバーの更新に失敗しました')
      }
    } catch (error) {
      toast.error('エラーが発生しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWarningConfirm = () => {
    setIsWarningDialogOpen(false)
    const originalUpdate = async () => {
      if (!editingMember) return
      setIsSubmitting(true)
      try {
        const response = await apiClient.updateMember(editingMember.id, {
          nickname: editFormData.nickname,
          grade: formData.grade,
          instruments: editFormData.instruments,
          role: editFormData.role,
        })
        if (response.success) {
          showSuccessToast({ message: 'メンバーを更新しました' })
          setIsEditDialogOpen(false)
          setEditingMember(null)
          resetForm()
          await fetchMembers()
        } else {
          toast.error('メンバーの更新に失敗しました')
        }
      } catch (error) {
        toast.error('エラーが発生しました')
      } finally {
        setIsSubmitting(false)
      }
    }
    originalUpdate()
  }

  const handleDeleteClick = (member: MemberListItem) => {
    setDeletingMember(member)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingMember) return

    setIsSubmitting(true)
    try {
      const response = await apiClient.deleteMember(deletingMember.id)
      if (response.success) {
        showSuccessToast({ message: 'メンバーを削除しました' })
        setIsDeleteDialogOpen(false)
        setDeletingMember(null)
        await fetchMembers()
      } else {
        toast.error('メンバーの削除に失敗しました')
      }
    } catch (error) {
      toast.error('エラーが発生しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInstrumentChange = (instrument: string, checked: boolean) => {
    setEditFormData(prev => ({
      ...prev,
      instruments: checked 
        ? [...prev.instruments, instrument]
        : prev.instruments.filter(i => i !== instrument)
    }))
  }

  const handleCsvSelect = async (file: File) => {
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length === 0) {
        toast.error('CSVファイルが空です')
        return
      }
      const parseCsvLine = (input: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < input.length; i++) {
          const ch = input[i]
          if (ch === '"') {
            if (inQuotes && input[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (ch === ',' && !inQuotes) {
            result.push(current)
            current = ''
          } else {
            current += ch
          }
        }
        result.push(current)
        return result.map(cell => cell.replace(/^\s*\"|\"\s*$/g, '').trim())
      }
      const headerRaw = lines[0]
      const headers = parseCsvLine(headerRaw).map(col => col.toLowerCase())
      const required = ['name','email','grade']
      const hasAll = required.every(h => headers.includes(h))
      if (!hasAll) {
        toast.error('ヘッダーが不足しています: name,email,grade は必須です')
        return
      }
      const idx = {
        name: headers.indexOf('name'),
        email: headers.indexOf('email'),
        grade: headers.indexOf('grade'),
        nickname: headers.indexOf('nickname'),
        instruments: headers.indexOf('instruments'),
        role: headers.indexOf('role'),
      }
      const members: Array<{ name: string; email: string; grade: number | null; nickname?: string; instruments?: string[]; role?: string; row: number; errors: string[] }> = []
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        const columns = parseCsvLine(line)
        if (columns.length === 0) continue
        const name = columns[idx.name] || ''
        const email = columns[idx.email] || ''
        const gradeStr = columns[idx.grade] || ''
        const nickname = idx.nickname >= 0 ? (columns[idx.nickname] || '') : ''
        const instrumentsRaw = idx.instruments >= 0 ? (columns[idx.instruments] || '') : ''
        const roleRaw = idx.role >= 0 ? (columns[idx.role] || '') : ''
        const errors: string[] = []
        if (!name || !email || !gradeStr) {
          errors.push('REQUIRED_MISSING')
        }
        const parsed = parseInt(gradeStr)
        const grade = Number.isFinite(parsed) ? parsed : null
        if (grade === null || grade < 1 || grade > 6) {
          if (gradeStr) {
            errors.push('INVALID_GRADE')
          }
        }
        const normalizeInstruments = (raw: string): string[] => {
          if (!raw) return []
          const text = raw.toUpperCase()
          const codes: Array<'VO'|'GT'|'KEY'|'DR'|'BA'> = ['VO','GT','KEY','DR','BA']
          const found = codes.filter(code => text.includes(code))
          return Array.from(new Set(found))
        }
        const instrumentsArr = normalizeInstruments(instrumentsRaw)
        const instruments = instrumentsArr.length > 0 ? instrumentsArr : undefined
        const allowedRoles = new Set(['MGR','CHF','MAC','MBR','ADM','NHD','NAC'])
        const role = roleRaw ? roleRaw.toUpperCase() : undefined
        const roleFinal = role && allowedRoles.has(role) ? role : undefined
        members.push({ name, email, grade, nickname, instruments, role: roleFinal, row: i + 1, errors })
      }
      if (members.length === 0) {
        toast.error('インポートするメンバーが見つかりません')
        return
      }
      setCsvMembers(members)
    } catch {
      toast.error('CSVファイルの読み込みに失敗しました')
    }
  }

  const submitCsvImport = async () => {
    if (csvMembers.length === 0) {
      toast.error('インポート対象がありません')
      return
    }
    const sendingList = csvMembers.filter(
      m => m.errors.length === 0 && !existingEmails.has((m.email || '').trim().toLowerCase())
    )
    if (sendingList.length === 0) {
      toast.error('全てスキップ対象です（重複または必須不足）')
      return
    }
    setIsSubmitting(true)
    try {
      const payload = sendingList.map(m => ({
        name: m.name,
        email: m.email,
        grade: m.grade as number,
        nickname: m.nickname || undefined,
        instruments: m.instruments || undefined,
        role: m.role || undefined,
      }))
      const response = await apiClient.bulkCreateMembers(payload)
      if (response.success && response.data) {
        const successCount = response.data.created.length
        const failCount = response.data.failed.length
        if (successCount > 0) {
          showSuccessToast({ message: `${successCount}件のメンバーを追加しました` })
        }
        if (failCount > 0) {
          toast.error(`${failCount}件のインポートに失敗しました`)
        }
        setCsvMembers([])
        setIsCsvImportDialogOpen(false)
        await fetchMembers()
      } else {
        toast.error('CSVインポートに失敗しました')
      }
    } catch {
      toast.error('CSVインポートに失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  

  return (
    <>
      <PageHeader 
        rightActions={
          isUserAdmin ? (
            <>
              <Dialog open={isCsvImportDialogOpen} onOpenChange={(open) => { setIsCsvImportDialogOpen(open); if (!open) setCsvMembers([]) }}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <UploadIcon className="h-4 w-4" />
                    CSVインポート
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>CSVインポート</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>CSVファイル</Label>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleCsvSelect(file)
                          }
                        }}
                        disabled={isSubmitting}
                      />
                    </div>
                    {csvMembers.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700">{csvMembers.length}件を読み込みました</div>
                        {duplicateEmailsInDb.length > 0 && (
                          <Alert variant="destructive">
                            <AlertTitle>重複ユーザーはスキップされます</AlertTitle>
                            <AlertDescription>
                              {duplicateEmailsInDb.length}件のメールアドレスが既存データと重複しています。{duplicateEmailsInDb.slice(0,5).join(', ')}{duplicateEmailsInDb.length > 5 ? ' 他' + (duplicateEmailsInDb.length-5) + '件' : ''}
                            </AlertDescription>
                          </Alert>
                        )}
                        {(missingRequiredRows.length > 0 || invalidGradeRows.length > 0) && (
                          <Alert className="border-amber-500/50 text-amber-800 bg-amber-50">
                            <AlertTitle>必須不足の行はスキップされます</AlertTitle>
                            <AlertDescription>
                              必須列不足 {missingRequiredRows.length} 行{invalidGradeRows.length > 0 ? `、無効な学年 ${invalidGradeRows.length} 行` : ''}
                            </AlertDescription>
                          </Alert>
                        )}
                        <div className="max-h-64 overflow-auto border rounded">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>名前</TableHead>
                                <TableHead>メール</TableHead>
                                <TableHead>学年</TableHead>
                                <TableHead>ニックネーム</TableHead>
                                <TableHead>楽器</TableHead>
                                <TableHead>役職</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {csvMembers.map((m, idx) => {
                                const isDup = existingEmails.has((m.email || '').trim().toLowerCase())
                                const isInvalid = m.errors.length > 0
                                const rowClass = isDup ? 'bg-red-50' : isInvalid ? 'bg-amber-50' : undefined
                                return (
                                <TableRow key={idx} className={rowClass}>
                                  <TableCell>{m.name}</TableCell>
                                  <TableCell>{m.email}</TableCell>
                                  <TableCell>{m.grade ?? '-'}</TableCell>
                                  <TableCell>{m.nickname || '-'}</TableCell>
                                  <TableCell>
                                    {Array.isArray(m.instruments) && m.instruments.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {m.instruments.map((inst, i) => (
                                          <span key={`${inst}-${i}`} className={`${instrumentColors[inst as keyof typeof instrumentColors] || ''} px-2 py-0.5 rounded text-xs whitespace-nowrap`}>
                                            {instrumentNames[inst as keyof typeof instrumentNames] || inst}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      '-'
                                    )}
                                  </TableCell>
                                  <TableCell>{m.role || '-'}</TableCell>
                                </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                    <div className="text-sm text-gray-500 space-y-1">
                      <p>CSV仕様</p>
                      <p>・1行目はヘッダー必須</p>
                      <p>・必須ヘッダー: name, email, grade（gradeは1-6の整数）</p>
                      <p>・任意ヘッダー: nickname, instruments, role</p>
                      <p>・instruments: VO, GT, KEY, DR, BA のコードを文字列内に含めて記述（複数可）</p>
                      <p>　例: DR,GT,VO｜DR GT VO｜["DR","GT","VO"]</p>
                      <p>・role: MGR, CHF, MAC, MBR, ADM, NHD, NAC のいずれか</p>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <div>
                        <Button variant="outline" onClick={() => { setCsvMembers([]); }} disabled={isSubmitting || csvMembers.length === 0}>
                          クリア
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsCsvImportDialogOpen(false)}>
                          閉じる
                        </Button>
                        <LoadingButton onClick={submitCsvImport} isLoading={isSubmitting} disabled={csvMembers.length === 0}>
                          保存
                        </LoadingButton>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => resetForm()}>
                    <PlusIcon className="h-4 w-4" />
                    追加
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>メンバーを追加</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">名前</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">メールアドレス</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="grade">学年</Label>
                    <Select value={formData.grade.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, grade: parseInt(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6].map(grade => (
                          <SelectItem key={grade} value={grade.toString()}>{grade}年</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      キャンセル
                    </Button>
                    <LoadingButton onClick={handleCreate} isLoading={isSubmitting}>
                      作成
                    </LoadingButton>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            </>
          ) : undefined
        }
      />
      <div className="p-4 pt-0 mx-auto">
      <Card className="w-full max-w-screen mx-auto">
        <CardContent className="p-6">
          <div className="mb-6">
            {loading ? (
              <Skeleton className="h-10 w-full max-w-sm mx-auto" />
            ) : (
              <Input
                type="text"
                placeholder="名前、ニックネーム、学籍番号で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm mx-auto"
              />
            )}
          </div>
          <div className="rounded-lg border border-gray-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-100">
                  <TableHead className="text-center font-semibold whitespace-nowrap">学籍番号</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">学年</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">名前</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">役職</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">ニックネーム</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">楽器</TableHead>
                  {isUserAdmin && (
                    <TableHead className="text-center font-semibold whitespace-nowrap">操作</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, idx) => (
                      <motion.tr
                        key={`skeleton-${idx}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <TableCell className="text-center"><Skeleton className="h-4 w-24 mx-auto" /></TableCell>
                        <TableCell className="text-center"><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                        <TableCell className="text-center"><Skeleton className="h-4 w-28 mx-auto" /></TableCell>
                        <TableCell className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                        <TableCell className="text-center"><Skeleton className="h-4 w-24 mx-auto" /></TableCell>
                        <TableCell className="text-left"><Skeleton className="h-4 w-40" /></TableCell>
                        {isUserAdmin && (
                          <TableCell className="text-center">
                            <Skeleton className="h-8 w-24 mx-auto" />
                          </TableCell>
                        )}
                      </motion.tr>
                    ))
                  ) : filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <motion.tr
                        key={user.student_number}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="hover:bg-gray-50"
                      >
                        <TableCell className="text-center font-medium text-gray-900 whitespace-nowrap">{user.student_number}</TableCell>
                        <TableCell className="text-center text-gray-800 whitespace-nowrap">{user.grade}</TableCell>
                        <TableCell className="text-center text-gray-800 whitespace-nowrap">{user.name}</TableCell>
                        <TableCell className="text-center text-gray-800 whitespace-nowrap">{roleNames[user.role]}</TableCell>
                        <TableCell className="text-center text-gray-600 whitespace-nowrap">{user.nickname || '-'}</TableCell>
                        <TableCell className="text-left">
                          <div className="flex flex-wrap gap-1">
                            {user.instruments.map((instrument) => (
                              <Badge key={instrument} className={`${instrumentColors[instrument]} whitespace-nowrap`}>
                                {instrumentNames[instrument]}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        {isUserAdmin && (
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(user)}
                              >
                                <EditIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteClick(user)}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </motion.tr>
                    ))
                  ) : (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TableCell colSpan={isUserAdmin ? 7 : 6} className="text-center py-4 text-gray-500">
                        該当する部員が見つかりません。
                      </TableCell>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>メンバーを編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-nickname">ニックネーム</Label>
              <Input
                id="edit-nickname"
                value={editFormData.nickname}
                onChange={(e) => setEditFormData(prev => ({ ...prev, nickname: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-grade">学年</Label>
              <Select value={formData.grade.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, grade: parseInt(value) }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map(grade => (
                    <SelectItem key={grade} value={grade.toString()}>{grade}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-role">役職</Label>
              <Select value={editFormData.role} onValueChange={(value) => setEditFormData(prev => ({ ...prev, role: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleNames).map(([key, value]) => (
                    <SelectItem key={key} value={key}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>楽器</Label>
              <div className="space-y-2">
                {Object.entries(instrumentNames).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${key}`}
                      checked={editFormData.instruments.includes(key)}
                      onCheckedChange={(checked) => handleInstrumentChange(key, !!checked)}
                    />
                    <Label htmlFor={`edit-${key}`}>{value}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                キャンセル
              </Button>
              <LoadingButton onClick={handleUpdate} isLoading={isSubmitting}>
                保存
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>メンバーを削除</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <strong>{deletingMember?.name}</strong> を削除しますか？
            </p>
            <p className="text-xs text-gray-500">
              この操作は取り消すことができません。
            </p>
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsDeleteDialogOpen(false)
                  setDeletingMember(null)
                }}
                disabled={isSubmitting}
              >
                キャンセル
              </Button>
              <LoadingButton 
                variant="destructive" 
                onClick={handleDeleteConfirm}
                isLoading={isSubmitting}
              >
                削除
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warning Dialog */}
      <Dialog open={isWarningDialogOpen} onOpenChange={setIsWarningDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>確認</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              管理者権限を持つアカウントの役職を「部員」に変更しようとしています。
            </p>
            <p className="text-xs text-gray-500">
              役職を「部員」に変更すると、管理者権限が失われます。本当に実行しますか？
            </p>
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setIsWarningDialogOpen(false)}
                disabled={isSubmitting}
              >
                キャンセル
              </Button>
              <LoadingButton 
                variant="destructive" 
                onClick={handleWarningConfirm}
                isLoading={isSubmitting}
              >
                変更する
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
