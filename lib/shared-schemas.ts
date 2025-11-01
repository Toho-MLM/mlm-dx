import { z } from 'zod';
import { addMinutes, addHours, isBefore, startOfDay, addDays } from 'date-fns';

const JAPAN_TIME_OFFSET_HOURS = 9;
const JAPAN_TIME_OFFSET_MS = JAPAN_TIME_OFFSET_HOURS * 60 * 60 * 1000;

const getJSTHours = (date: Date): number => {
  const utcMs = date.getTime();
  const jstMs = utcMs + JAPAN_TIME_OFFSET_MS;
  const jstDate = new Date(jstMs);
  return jstDate.getUTCHours();
};

const getJSTMinutes = (date: Date): number => {
  const utcMs = date.getTime();
  const jstMs = utcMs + JAPAN_TIME_OFFSET_MS;
  const jstDate = new Date(jstMs);
  return jstDate.getUTCMinutes();
};

const getJSTDateString = (date: Date): string => {
  const utcMs = date.getTime();
  const jstMs = utcMs + JAPAN_TIME_OFFSET_MS;
  const jstDate = new Date(jstMs);
  return jstDate.toISOString().split('T')[0];
};

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

export const UnavailablePeriodSchema = z.object({
  id: z.string(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  reason: z.string().nullable(),
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
});

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

export const validateReservationTime = (startTime: string, endTime: string): { isValid: boolean; error?: string } => {
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { isValid: false, error: "無効な日時形式です。" };
    }
    
    const startJSTDate = getJSTDateString(start);
    const endJSTDate = getJSTDateString(end);
    
    if (startJSTDate !== endJSTDate) {
      return { isValid: false, error: "日をまたいで予約することはできません。" };
    }
    
    if (start >= end) {
      return { isValid: false, error: "終了時刻は開始時刻より後である必要があります。" };
    }
    
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    if (durationMinutes < 10) {
      return { isValid: false, error: "利用時間は最短10分です。" };
    }
    if (durationMinutes > 240) {
      return { isValid: false, error: "利用時間は最長4時間です。" };
    }
    
    const startHour = getJSTHours(start);
    const endHour = getJSTHours(end);
    const endMinute = getJSTMinutes(end);
    if (startHour < 6) {
      return { isValid: false, error: "利用時間は朝6時からです。" };
    }
    if (endHour > 23 || (endHour === 23 && endMinute > 0)) {
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

export const CreateUnavailablePeriodRequestSchema = z.object({
  start_datetime: z.string(),
  end_datetime: z.string(),
  reason: z.string().optional(),
}).refine((data) => {
  const start = new Date(data.start_datetime);
  const end = new Date(data.end_datetime);
  return end > start;
}, {
  message: "終了日時は開始日時より後である必要があります。"
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

export const UpdateEntryRequestSchema = z.object({
  note: z.string().nullable(),
});

export const TimelineItemSchema = z.object({
  entry_id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  position: z.number().nullable(),
  created_at: z.string(),
});

export const GetTimelineResponseSchema = z.object({
  configured: z.array(TimelineItemSchema),
  unconfigured: z.array(TimelineItemSchema),
});

export const UpdateTimelineRequestSchema = z.object({
  items: z.array(z.object({
    entry_id: z.string(),
    position: z.number().int().min(1).nullable(),
    start_time: z.string().datetime().nullable().optional(),
    end_time: z.string().datetime().nullable().optional(),
  })),
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

// Setlist 差分更新リクエスト
export const ReplaceSetlistItemsRequestSchema = z.object({
  items: z.array(z.object({
    title: z.string().min(1),
    artist: z.string().optional().default(''),
  })).max(100),
  hasSE: z.boolean(),
  admin: z.boolean().optional(),
});

// GET /setlist/event/:eventId レスポンス要素
export const EventSetlistBundleItemSchema = z.object({
  entry: z.object({
    id: z.string(),
    event_id: z.string(),
    group_id: z.string(),
    note: z.string().nullable().optional(),
  }),
  group_name: z.string(),
  setlist_items: z.array(z.object({
    position: z.number(),
    title: z.string(),
    artist: z.string(),
  })),
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
export type UnavailablePeriod = z.infer<typeof UnavailablePeriodSchema>;
export type CreateUnavailablePeriodRequest = z.infer<typeof CreateUnavailablePeriodRequestSchema>;
export type Entry = z.infer<typeof EntrySchema>;
export type CreateEntryRequest = z.infer<typeof CreateEntryRequestSchema>;
export type UpdateEntryRequest = z.infer<typeof UpdateEntryRequestSchema>;
export type SetlistItem = z.infer<typeof SetlistItemSchema>;
export type CreateSetlistItemRequest = z.infer<typeof CreateSetlistItemRequestSchema>;
export type UpdateSetlistItemRequest = z.infer<typeof UpdateSetlistItemRequestSchema>;
export type ReplaceSetlistItemsRequest = z.infer<typeof ReplaceSetlistItemsRequestSchema>;
export type EventSetlistBundleItem = z.infer<typeof EventSetlistBundleItemSchema>;
export type BulkCreateMemberRequest = z.infer<typeof BulkCreateMemberRequestSchema>;
export type BulkCreateMembersRequest = z.infer<typeof BulkCreateMembersRequestSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
export type GetTimelineResponse = z.infer<typeof GetTimelineResponseSchema>;
export type UpdateTimelineRequest = z.infer<typeof UpdateTimelineRequestSchema>;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
