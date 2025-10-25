'use client'

import { useState, useMemo } from 'react'
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
import { isAdmin } from '../../../../lib/shared-schemas'
import { apiClient } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { PlusIcon, EditIcon, TrashIcon } from 'lucide-react'


export function MemberList({ memberData }: { memberData: MemberListItem[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<MemberListItem | null>(null)
  const [deletingMember, setDeletingMember] = useState<MemberListItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { user } = useAuth()
  const isUserAdmin = user && isAdmin(user.role)

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

  const sortedUsers = useMemo(() => {
    if (!Array.isArray(memberData)) {
      return [];
    }
    return memberData.sort((a, b) => {
      if (a.grade !== b.grade) {
        return b.grade - a.grade
      }
      return a.student_number.localeCompare(b.student_number)
    })
  }, [memberData])

  const filteredUsers = useMemo(() => {
    return sortedUsers.filter(user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.nickname && user.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      user.student_number.includes(searchTerm)
    )
  }, [sortedUsers, searchTerm])

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
        toast.success('メンバーを作成しました')
        setIsCreateDialogOpen(false)
        resetForm()
        router.refresh()
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

    setIsSubmitting(true)
    try {
      const response = await apiClient.updateMember(editingMember.id, {
        nickname: editFormData.nickname,
        grade: formData.grade,
        instruments: editFormData.instruments,
        role: editFormData.role,
      })
      if (response.success) {
        toast.success('メンバーを更新しました')
        setIsEditDialogOpen(false)
        setEditingMember(null)
        resetForm()
        router.refresh()
      } else {
        toast.error('メンバーの更新に失敗しました')
      }
    } catch (error) {
      toast.error('エラーが発生しました')
    } finally {
      setIsSubmitting(false)
    }
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
        toast.success('メンバーを削除しました')
        setIsDeleteDialogOpen(false)
        setDeletingMember(null)
        router.refresh()
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

  return (
    <>
      <PageHeader 
        rightActions={
          isUserAdmin ? (
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
          ) : undefined
        }
      />
      <div className="p-5">
      <Card className="w-full max-w-6xl max-w-screen mx-auto">
        <CardContent className="p-6">
          <div className="mb-6">
            <Input
              type="text"
              placeholder="名前、ニックネーム、学籍番号で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm mx-auto"
            />
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
                  {filteredUsers.length > 0 ? (
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
                更新
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
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
    </>
  )
}