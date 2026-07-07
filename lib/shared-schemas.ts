import { z } from 'zod';
import { isBefore, startOfDay, addDays } from 'date-fns';

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

export const ExternalSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ExternalReservationSchema = z.object({
  id: z.string(),
  external_studio_id: z.string(),
  external_name: z.string().nullable(),
  user_id: z.string(),
  group_id: z.string(),
  user_name: z.string().nullable(),
  group_name: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  state: z.string(),
  cancellable: z.number(),
});

export const ExternalReservationConflictSchema = z.object({
  member_id: z.string(),
  member_name: z.string(),
  reservation_id: z.string(),
  reservation_type: z.enum(['HALL', 'EXTERNAL']),
  reservation_name: z.string(),
  location_name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
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

export const ReservationLimitScopeSchema = z.enum(['PERSONAL', 'GROUP']);
export const ReservationLimitTypeSchema = z.enum(['FIXED', 'ROLLING']);

export const ReservationLimitSchema = z.object({
  id: z.string(),
  scope: ReservationLimitScopeSchema,
  limit_type: ReservationLimitTypeSchema,
  start_datetime: z.string().nullable(),
  end_datetime: z.string().nullable(),
  window_days: z.number().nullable(),
  max_minutes: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ReservationLimitRemainingSchema = ReservationLimitSchema.extend({
  used_minutes: z.number(),
  remaining_minutes: z.number(),
});

export const AssignmentMapSchema = z.record(z.string(), z.array(z.string()));

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
  admin: z.boolean().optional(),
});

export const CreateExternalRequestSchema = z.object({
  names: z.array(z.string().trim().min(1)).min(1),
  start_datetime: z.string(),
  end_datetime: z.string(),
}).refine((data) => {
  const start = new Date(data.start_datetime);
  const end = new Date(data.end_datetime);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
}, {
  message: "終了日時は開始日時より後である必要があります。",
});

export const CreateExternalReservationRequestSchema = z.object({
  external_studio_id: z.string().min(1),
  group_id: z.string().min(1),
  start_time: z.string(),
  end_time: z.string(),
  admin: z.boolean().optional(),
  acknowledged_member_conflicts: z.boolean().optional(),
});

export const CheckExternalReservationRequestSchema = z.object({
  external_studio_id: z.string().min(1),
  group_id: z.string().min(1),
  start_time: z.string(),
  end_time: z.string(),
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

export const isReservationDateValid = (date: Date): boolean => {
  const now = new Date();
  const maxDate = addDays(now, 14);
  return !isBefore(date, startOfDay(now)) && date <= maxDate;
};

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

const ReservationLimitRequestSchemaBase = z.object({
  scope: ReservationLimitScopeSchema,
  limit_type: ReservationLimitTypeSchema,
  start_datetime: z.string().optional(),
  end_datetime: z.string().optional(),
  window_days: z.number().int().min(1).optional(),
  max_minutes: z.number().int().min(1),
}).superRefine((data, ctx) => {
  if (data.limit_type === 'FIXED') {
    if (!data.start_datetime || !data.end_datetime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "期間限定Limitでは開始日時と終了日時が必要です。",
      });
      return;
    }

    const start = new Date(data.start_datetime);
    const end = new Date(data.end_datetime);
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "終了日時は開始日時より後である必要があります。",
      });
    }
  }

  if (data.limit_type === 'ROLLING' && !data.window_days) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "常設Limitでは対象日数が必要です。",
    });
  }
});

export const CreateReservationLimitRequestSchema = ReservationLimitRequestSchemaBase;
export const UpdateReservationLimitRequestSchema = ReservationLimitRequestSchemaBase;

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
  admin: z.boolean().optional(),
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
  is_virtual: z.boolean().optional(),
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

export const ReplaceSetlistItemsRequestSchema = z.object({
  items: z.array(z.object({
    title: z.string().min(1),
    artist: z.string().optional().default(''),
  })).max(100),
  hasSE: z.boolean(),
  admin: z.boolean().optional(),
});

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

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

export type User = z.infer<typeof UserSchema>;
export type UserWithInstruments = z.infer<typeof UserWithInstrumentsSchema>;
export type GroupMember = z.infer<typeof GroupMemberSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type GroupWithMemberRole = z.infer<typeof GroupWithMemberRoleSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type External = z.infer<typeof ExternalSchema>;
export type ExternalReservation = z.infer<typeof ExternalReservationSchema>;
export type ExternalReservationConflict = z.infer<typeof ExternalReservationConflictSchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type UserHolderResponse = z.infer<typeof UserHolderResponseSchema>;
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type AddMemberToGroupRequest = z.infer<typeof AddMemberToGroupRequestSchema>;
export type AssignmentMap = z.infer<typeof AssignmentMapSchema>;
export type CreateReservationRequest = z.infer<typeof CreateReservationRequestSchema>;
export type CreateExternalRequest = z.infer<typeof CreateExternalRequestSchema>;
export type CreateExternalReservationRequest = z.infer<typeof CreateExternalReservationRequestSchema>;
export type CheckExternalReservationRequest = z.infer<typeof CheckExternalReservationRequestSchema>;
export type CreateArchiveRequest = z.infer<typeof CreateArchiveRequestSchema>;
export type UpdateArchiveRequest = z.infer<typeof UpdateArchiveRequestSchema>;
export type Event = z.infer<typeof EventSchema>;
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;
export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>;
export type UnavailablePeriod = z.infer<typeof UnavailablePeriodSchema>;
export type CreateUnavailablePeriodRequest = z.infer<typeof CreateUnavailablePeriodRequestSchema>;
export type ReservationLimitScope = z.infer<typeof ReservationLimitScopeSchema>;
export type ReservationLimitType = z.infer<typeof ReservationLimitTypeSchema>;
export type ReservationLimit = z.infer<typeof ReservationLimitSchema>;
export type ReservationLimitRemaining = z.infer<typeof ReservationLimitRemainingSchema>;
export type CreateReservationLimitRequest = z.infer<typeof CreateReservationLimitRequestSchema>;
export type UpdateReservationLimitRequest = z.infer<typeof UpdateReservationLimitRequestSchema>;
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
