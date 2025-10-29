import { z } from 'zod';
import { addMinutes, addHours, isBefore, startOfDay, addDays } from 'date-fns';

// 共有APIスキーマ - フロントエンドとバックエンドで使用

// 基本エンティティスキーマ
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  nickname: z.string().nullable(),
  instruments: z.array(z.string()),
  grade: z.number(),
  role: z.string(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const GroupMemberSchema = z.object({
  id: z.string(),
  instruments: z.array(z.string()),
});

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  assignments: z.array(GroupMemberSchema),
  is_main: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)),
  is_active: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ReservationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  group_id: z.string().nullable(),
  user_name: z.string().nullable(),
  group_name: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  state: z.string(),
  cancellable: z.number(),
});

export const UserWithInstrumentsSchema = UserSchema.extend({
  student_number: z.string(),
});

export const GroupWithMemberRoleSchema = GroupSchema.extend({
  member_role: z.string().nullable(),
});

export const MemberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  nickname: z.string().nullable(),
  instruments: z.array(z.string()),
  student_number: z.string(),
});

export const SessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    nickname: z.string().nullable(),
    picture: z.string().optional(),
  }).nullable(),
});

export const UserHolderResponseSchema = z.object({
  user: UserWithInstrumentsSchema,
  bands: z.array(GroupWithMemberRoleSchema),
});

export const ArchiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  youtube_url: z.string().nullable(),
  year: z.number(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  event_date: z.string(),
  entry_deadline: z.string(),
  is_entry_accepting: z.boolean(),
  setlist_deadline: z.string(),
  is_setlist_accepting: z.boolean(),
  group_limit: z.number(),
  song_limit: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

// リクエストスキーマ
export const AssignmentMapSchema = z.record(z.string(), z.string());

export const CreateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.union([z.string(), AssignmentMapSchema]).optional(),
  is_main: z.boolean().optional(),
});

export const UpdateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.union([z.string(), AssignmentMapSchema]).optional(),
  is_main: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const UpdateUserRequestSchema = z.object({
  nickname: z.string(),
  instruments: z.array(z.string()),
});

export const AddMemberToGroupRequestSchema = z.object({
  user_id: z.string(),
  instrument: z.string(),
  role: z.string().optional(),
});

export const CreateReservationRequestSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  group_id: z.string().optional(),
}).refine((data) => {
  const start = new Date(data.start_time);
  const end = new Date(data.end_time);
  
  // 日をまたがないかチェック
  if (start.toDateString() !== end.toDateString()) {
    return false;
  }
  
  // 開始時刻が終了時刻より前かチェック
  if (start >= end) {
    return false;
  }
  
  // 最短10分、最長4時間のチェック
  const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
  if (durationMinutes < 10 || durationMinutes > 240) {
    return false;
  }
  
  // 利用時間帯のチェック（6:00-23:00）
  const startHour = start.getHours();
  const endHour = end.getHours();
  if (startHour < 6 || endHour > 23 || (endHour === 23 && end.getMinutes() > 0)) {
    return false;
  }
  
  return true;
}, {
  message: "予約時間が無効です。日をまたがず、最短10分から最長4時間、6:00-23:00の範囲で予約してください。"
});

// 管理者権限判定関数
export function isAdmin(role: string | undefined): boolean {
  if (!role) {
    return false;
  }
  return role !== 'MBR';
}

export function requireAdmin(role: string | undefined): void {
  if (!isAdmin(role)) {
    throw new Error('INSUFFICIENT_PERMISSIONS');
  }
}

// 予約バリデーション関数
export const validateReservationTime = (startTime: string, endTime: string): { isValid: boolean; error?: string } => {
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    // 日をまたがないかチェック
    if (start.toDateString() !== end.toDateString()) {
      return { isValid: false, error: "日をまたいで予約することはできません。" };
    }
    
    // 開始時刻が終了時刻より前かチェック
    if (start >= end) {
      return { isValid: false, error: "終了時刻は開始時刻より後である必要があります。" };
    }
    
    // 最短10分、最長4時間のチェック
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    if (durationMinutes < 10) {
      return { isValid: false, error: "利用時間は最短10分です。" };
    }
    if (durationMinutes > 240) {
      return { isValid: false, error: "利用時間は最長4時間です。" };
    }
    
    // 利用時間帯のチェック（6:00-23:00）
    const startHour = start.getHours();
    const endHour = end.getHours();
    if (startHour < 6) {
      return { isValid: false, error: "利用時間は朝6時からです。" };
    }
    if (endHour > 23 || (endHour === 23 && end.getMinutes() > 0)) {
      return { isValid: false, error: "利用時間は夜11時までです。" };
    }
    
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: "無効な日時形式です。" };
  }
};

// 予約可能な日付かチェック（2週間以内、過去の日付でない）
export const isReservationDateValid = (date: Date): boolean => {
  const now = new Date();
  const maxDate = addDays(now, 14);
  return !isBefore(date, startOfDay(now)) && date <= maxDate;
};

// 予約可能な時刻かチェック（過去の時刻でない、利用時間内）
export const isReservationTimeValid = (date: Date, hour: number, minute: number): boolean => {
  const now = new Date();
  const selectedDate = new Date(date);
  selectedDate.setHours(hour, minute);
  
  return !isBefore(selectedDate, now) && hour >= 6 && !(hour === 23 && minute > 0);
};

export const CreateArchiveRequestSchema = z.object({
  title: z.string().min(1),
  youtube_url: z.string().url().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 10),
});

export const UpdateArchiveRequestSchema = z.object({
  title: z.string().min(1),
  youtube_url: z.string().url().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 10),
});

export const CreateEventRequestSchema = z.object({
  title: z.string().min(1),
  event_date: z.string(),
  entry_deadline: z.string(),
  is_entry_accepting: z.boolean(),
  setlist_deadline: z.string(),
  is_setlist_accepting: z.boolean(),
  group_limit: z.number().min(0),
  song_limit: z.number().min(0),
});

export const UpdateEventRequestSchema = z.object({
  title: z.string().min(1),
  event_date: z.string(),
  entry_deadline: z.string(),
  is_entry_accepting: z.boolean(),
  setlist_deadline: z.string(),
  is_setlist_accepting: z.boolean(),
  group_limit: z.number().min(0),
  song_limit: z.number().min(0),
});

export const EntrySchema = z.object({
  id: z.string(),
  event_id: z.string(),
  group_id: z.string(),
  note: z.string().nullable(),
  created_at: z.string(),
});

export const CreateEntryRequestSchema = z.object({
  event_id: z.string(),
  group_ids: z.array(z.string()),
});

export const SetlistItemSchema = z.object({
  id: z.string(),
  entry_id: z.string(),
  position: z.number(),
  title: z.string(),
  artist: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CreateSetlistItemRequestSchema = z.object({
  entry_id: z.string(),
  position: z.number(),
  title: z.string().min(1),
  artist: z.string().min(1),
  admin: z.boolean().optional(),
});

export const UpdateSetlistItemRequestSchema = z.object({
  position: z.number().optional(),
  title: z.string().min(1).optional(),
  artist: z.string().optional(),
  admin: z.boolean().optional(),
});

export const BulkCreateMemberRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  grade: z.number().min(1).max(6),
  nickname: z.string().optional(),
  instruments: z.array(z.string()).optional(),
  role: z.enum(['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC']).optional(),
});

export const BulkCreateMembersRequestSchema = z.object({
  members: z.array(BulkCreateMemberRequestSchema),
});

// APIレスポンススキーマ
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

// 型定義
export type User = z.infer<typeof UserSchema>;
export type UserWithInstruments = z.infer<typeof UserWithInstrumentsSchema>;
export type GroupMember = z.infer<typeof GroupMemberSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type GroupWithMemberRole = z.infer<typeof GroupWithMemberRoleSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type UserHolderResponse = z.infer<typeof UserHolderResponseSchema>;
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type AddMemberToGroupRequest = z.infer<typeof AddMemberToGroupRequestSchema>;
export type AssignmentMap = z.infer<typeof AssignmentMapSchema>;
export type CreateReservationRequest = z.infer<typeof CreateReservationRequestSchema>;
export type CreateArchiveRequest = z.infer<typeof CreateArchiveRequestSchema>;
export type UpdateArchiveRequest = z.infer<typeof UpdateArchiveRequestSchema>;
export type Event = z.infer<typeof EventSchema>;
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;
export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>;
export type Entry = z.infer<typeof EntrySchema>;
export type CreateEntryRequest = z.infer<typeof CreateEntryRequestSchema>;
export type SetlistItem = z.infer<typeof SetlistItemSchema>;
export type CreateSetlistItemRequest = z.infer<typeof CreateSetlistItemRequestSchema>;
export type UpdateSetlistItemRequest = z.infer<typeof UpdateSetlistItemRequestSchema>;
export type BulkCreateMemberRequest = z.infer<typeof BulkCreateMemberRequestSchema>;
export type BulkCreateMembersRequest = z.infer<typeof BulkCreateMembersRequestSchema>;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
