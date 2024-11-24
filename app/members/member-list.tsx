'use client'

import { useState, useMemo } from 'react'
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AnimatePresence, motion } from 'framer-motion'
import { MemberData, instrumentNames, roleNames, instrumentColors } from '@/app/types'


export function MemberList({ memberData }: { memberData: MemberData[] }) {
  const [searchTerm, setSearchTerm] = useState('')

  const sortedUsers = useMemo(() => {
    if (!Array.isArray(memberData)) {
      return [];
    }
    return memberData.sort((a, b) => {
      if (a.grade !== b.grade) {
        return b.grade.localeCompare(a.grade) // 学年で降順
      }
      return a.student_number.localeCompare(b.student_number) // 学籍番号で昇順
    })
  }, [memberData])

  const filteredUsers = useMemo(() => {
    return sortedUsers.filter(user => 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.nickname && user.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      user.student_number.includes(searchTerm)
    )
  }, [sortedUsers, searchTerm])

  return (
    <div className="p-5">
      <Card className="w-full max-w-6xl min-w-fit mx-auto">
        <CardHeader className="bg-gray-200">
          <CardTitle className="text-3xl font-bold text-center text-gray-800">部員名簿</CardTitle>
        </CardHeader>
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
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-100">
                  <TableHead className="text-center font-semibold whitespace-nowrap">学籍番号</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">学年</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">名前</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">役職</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">ニックネーム</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap">楽器</TableHead>
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
                      </motion.tr>
                    ))
                  ) : (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TableCell colSpan={6} className="text-center py-4 text-gray-500">
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
  )
}