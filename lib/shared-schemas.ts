import { z } from 'zod';

const JAPAN_TIME_OFFSET_HOURS = 9;
const JAPAN_TIME_OFFSET_MS = JAPAN_TIME_OFFSET_HOURS * 60 * 60 * 1000;

export const UuidSchema = z.string().uuid();

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


export const InstrumentSchema = z.enum(['VO', 'GT', 'KEY', 'DR', 'BA']);
export const UserRoleSchema = z.enum(['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC']);

const ValidDateTimeStringSchema = z.string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const UserSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  name: z.string(),
  nickname: z.string().nullable(),
  instruments: z.array(InstrumentSchema),
  grade: z.number(),
  role: UserRoleSchema,
});

export const GroupMemberSchema = z.object({
  id: UuidSchema,
  instruments: z.array(z.string()),
});

export const GroupSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  assignments: z.array(GroupMemberSchema),
  is_main: z.boolean(),
  is_active: z.boolean(),
});

export const ReservationStateSchema = z.enum([
  'PENDING',
  'WITHDRAWN',
  'DECLINED',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
]);

export const ReservationSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  group_id: UuidSchema.nullable(),
  user_name: z.string().nullable(),
  group_name: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  state: ReservationStateSchema,
  cancellable: z.boolean(),
});

export const LotteryTargetTypeSchema = z.enum(['HALL', 'EXTERNAL']);

export const ExternalSchema = z.object({
  id: UuidSchema,
  target_type: LotteryTargetTypeSchema,
  start_datetime: z.string(),
  end_datetime: z.string(),
  room_names: z.array(z.string().min(1)).min(1),
});

export const ExternalReservationSchema = z.object({
  id: UuidSchema,
  external_studio_id: UuidSchema,
  room_number: z.number().int().positive(),
  room_name: z.string().nullable(),
  user_id: UuidSchema,
  group_id: UuidSchema.nullable(),
  user_name: z.string().nullable(),
  group_name: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  state: ReservationStateSchema,
  cancellable: z.boolean(),
});

export const ExternalReservationConflictSchema = z.object({
  member_id: UuidSchema,
  member_name: z.string(),
  reservation_id: UuidSchema,
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
  id: UuidSchema,
  email: z.string().email(),
  name: z.string(),
  nickname: z.string().nullable(),
  instruments: z.array(z.string()),
  student_number: z.string(),
});

export const SessionResponseSchema = z.object({
  user: z.object({
    id: UuidSchema,
    email: z.string().email(),
    name: z.string(),
    nickname: z.string().nullable(),
    picture: z.string().optional(),
    instruments: z.array(InstrumentSchema),
    grade: z.number(),
    role: UserRoleSchema,
  }).nullable(),
});

export const UserHolderResponseSchema = z.object({
  user: UserWithInstrumentsSchema,
  bands: z.array(GroupWithMemberRoleSchema),
});

export const ArchiveSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  youtube_url: z.string().nullable(),
  year: z.number(),
});

export const EventSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  event_date: z.string(),
  entry_deadline: z.string(),
  is_entry_accepting: z.boolean(),
  setlist_deadline: z.string(),
  is_setlist_accepting: z.boolean(),
  group_limit: z.number(),
  song_limit: z.number(),
});

export const DashboardMemberActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ENTRY_AVAILABLE'),
    event_id: UuidSchema,
    event_title: z.string(),
    due_at: z.string(),
    eligible_group_count: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('SETLIST_EMPTY'),
    event_id: UuidSchema,
    event_title: z.string(),
    due_at: z.string(),
    group_id: UuidSchema,
    group_name: z.string(),
  }),
]);

export const DashboardAdminActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ENTRY_ACCEPTING_AFTER_DEADLINE'),
    event_id: UuidSchema,
    event_title: z.string(),
    due_at: z.string(),
  }),
  z.object({
    kind: z.literal('SETLIST_ACCEPTING_AFTER_DEADLINE'),
    event_id: UuidSchema,
    event_title: z.string(),
    due_at: z.string(),
  }),
  z.object({
    kind: z.literal('TIMELINE_INCOMPLETE'),
    event_id: UuidSchema,
    event_title: z.string(),
    event_date: z.string(),
    missing_count: z.number().int().positive(),
  }),
]);

const DashboardReservationScheduleItemBaseSchema = z.object({
  reservation_id: UuidSchema,
  title: z.string(),
  start_at: z.string(),
  end_at: z.string(),
  state: ReservationStateSchema,
});

export const DashboardScheduleItemSchema = z.discriminatedUnion('kind', [
  DashboardReservationScheduleItemBaseSchema.extend({
    kind: z.literal('HALL_RESERVATION'),
  }),
  DashboardReservationScheduleItemBaseSchema.extend({
    kind: z.literal('EXTERNAL_RESERVATION'),
  }),
  z.object({
    kind: z.literal('ENTRY_DEADLINE'),
    event_id: UuidSchema,
    event_title: z.string(),
    due_at: z.string(),
  }),
  z.object({
    kind: z.literal('SETLIST_DEADLINE'),
    event_id: UuidSchema,
    event_title: z.string(),
    due_at: z.string(),
  }),
]);

export const DashboardDataSchema = z.object({
  member_actions: z.array(DashboardMemberActionSchema).max(5),
  admin_actions: z.array(DashboardAdminActionSchema).max(5),
  schedule_items: z.array(DashboardScheduleItemSchema).max(5),
});

export const UnavailablePeriodSchema = z.object({
  id: UuidSchema,
  start_datetime: z.string(),
  end_datetime: z.string(),
  reason: z.string().nullable(),
});

export const ReservationLimitScopeSchema = z.enum(['PERSONAL', 'GROUP']);
export const ReservationLimitTypeSchema = z.enum(['FIXED', 'ROLLING']);

export const ReservationLimitSchema = z.object({
  id: UuidSchema,
  scope: ReservationLimitScopeSchema,
  limit_type: ReservationLimitTypeSchema,
  start_datetime: z.string().nullable(),
  end_datetime: z.string().nullable(),
  window_days: z.number().nullable(),
  max_minutes: z.number(),
});

export const ReservationLimitRemainingSchema = ReservationLimitSchema.extend({
  used_minutes: z.number(),
  remaining_minutes: z.number(),
});

export const AssignmentMapSchema = z.record(z.string(), z.array(UuidSchema));

export const CreateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.union([z.string(), AssignmentMapSchema]),
  is_main: z.boolean(),
});

export const UpdateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.union([z.string(), AssignmentMapSchema]).optional(),
  is_main: z.boolean(),
  is_active: z.boolean(),
});

export const DeleteGroupsRequestSchema = z.object({
  ids: z.array(UuidSchema).min(1).max(100),
});

export const UpdateUserRequestSchema = z.object({
  nickname: z.string().trim().min(1),
  instruments: z.array(InstrumentSchema),
});

export const EmailNotificationTypeSchema = z.enum([
  'RESERVATION_RECEIVED',
  'RESERVATION_CONFIRMED',
  'RESERVATION_EDITED',
  'RESERVATION_ADJUSTED',
  'RESERVATION_DECLINED',
  'RESERVATION_CANCELLED',
  'RESERVATION_REVOKED',
]);

export const EmailNotificationPreferencesSchema = z.record(
  EmailNotificationTypeSchema,
  z.boolean()
);

export const UpdateEmailNotificationPreferenceRequestSchema = z.object({
  enabled: z.boolean(),
});

export const AddMemberToGroupRequestSchema = z.object({
  user_id: UuidSchema,
  instrument: z.string(),
  role: z.string().optional(),
});

export const CreateReservationRequestSchema = z.object({
  start_time: ValidDateTimeStringSchema,
  end_time: ValidDateTimeStringSchema,
  group_id: UuidSchema.optional(),
  admin: z.boolean().optional(),
});

export const UpdateReservationRequestSchema = z.object({
  start_time: ValidDateTimeStringSchema,
  end_time: ValidDateTimeStringSchema,
  admin: z.boolean().optional(),
});

export const UpdateReservationStatusRequestSchema = z.object({
  state: ReservationStateSchema,
});

export const CreateExternalRequestSchema = z.object({
  target_type: LotteryTargetTypeSchema.default('EXTERNAL'),
  names: z.array(z.string().trim().min(1)).min(1),
  start_datetime: ValidDateTimeStringSchema,
  end_datetime: ValidDateTimeStringSchema,
}).refine((data) => {
  const start = new Date(data.start_datetime);
  const end = new Date(data.end_datetime);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
}, {
  message: "終了日時は開始日時より後である必要があります。",
}).refine((data) => new Set(data.names.map((name) => name.trim())).size === data.names.length, {
  message: "部屋名は重複できません。",
  path: ['names'],
});

export const CreateExternalReservationRequestSchema = z.object({
  external_studio_id: UuidSchema,
  room_number: z.number().int().positive(),
  group_id: UuidSchema.nullable().optional(),
  start_time: ValidDateTimeStringSchema,
  end_time: ValidDateTimeStringSchema,
  admin: z.boolean().optional(),
  acknowledged_member_conflicts: z.boolean().optional(),
});

export const UpdateExternalReservationRequestSchema = z.object({
  start_time: ValidDateTimeStringSchema,
  end_time: ValidDateTimeStringSchema,
  admin: z.boolean().optional(),
  acknowledged_member_conflicts: z.boolean().optional(),
});

export const CheckExternalReservationRequestSchema = z.object({
  external_studio_id: UuidSchema,
  room_number: z.number().int().positive(),
  group_id: UuidSchema.nullable().optional(),
  start_time: ValidDateTimeStringSchema,
  end_time: ValidDateTimeStringSchema,
  admin: z.boolean().optional(),
});

export const ExternalLotteryStateSchema = z.enum(['PENDING', 'WON', 'LOST', 'CANCELLED']);

export const EXTERNAL_LOTTERY_MIN_DURATION_MINUTES = 30;
export const EXTERNAL_LOTTERY_MAX_DURATION_MINUTES = 120;

export const isExternalLotteryReservationProtected = (
  startValue: Date | string,
  endValue: Date | string,
  nowValue: Date | string = new Date()
): boolean => {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const now = new Date(nowValue);
  if ([start, end, now].some((date) => Number.isNaN(date.getTime())) || end <= start) return false;

  const today = getJSTDateString(now);
  const tomorrow = new Date(`${today}T00:00:00+09:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const latest = new Date(`${today}T00:00:00+09:00`);
  latest.setUTCDate(latest.getUTCDate() + 14);
  const tomorrowString = getJSTDateString(tomorrow);
  const latestString = getJSTDateString(latest);
  let targetDate = getJSTDateString(start);
  const lastTargetDate = getJSTDateString(new Date(end.getTime() - 1));

  while (targetDate <= lastTargetDate) {
    if (targetDate >= tomorrowString && targetDate <= latestString) {
      const drawAt = new Date(`${targetDate}T21:00:00+09:00`);
      drawAt.setUTCDate(drawAt.getUTCDate() - 1);
      if (now < drawAt) return true;
    }
    const nextDate = new Date(`${targetDate}T00:00:00+09:00`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    targetDate = getJSTDateString(nextDate);
  }
  return false;
};

export const ExternalLotteryApplicationSchema = z.object({
  id: UuidSchema,
  external_studio_id: UuidSchema,
  target_type: LotteryTargetTypeSchema,
  user_id: UuidSchema,
  group_id: UuidSchema.nullable(),
  user_name: z.string().nullable(),
  group_name: z.string().nullable(),
  is_main: z.boolean().nullable(),
  preferred_start_datetime: z.string().nullable(),
  preferred_end_datetime: z.string().nullable(),
  requested_duration_minutes: z.number().int().nullable(),
  state: ExternalLotteryStateSchema,
  fairness_score: z.number().nullable(),
  assigned_room_number: z.number().int().positive().nullable(),
  assigned_room_name: z.string().nullable(),
  assigned_start_datetime: z.string().nullable(),
  assigned_end_datetime: z.string().nullable(),
  studio_start_datetime: z.string(),
  studio_end_datetime: z.string(),
  room_names: z.array(z.string().min(1)).min(1),
});

export type ExternalLotteryWeightInput = {
  id: string;
  schedulingSlackMinutes: number;
  fairnessScore: number;
};

const getRelativeLotteryAdvantage = (value: number, values: number[]): number => {
  const uniqueValues = [...new Set(values)].sort((left, right) => left - right);
  if (uniqueValues.length <= 1) return 0;
  return 1 - uniqueValues.indexOf(value) / (uniqueValues.length - 1);
};

export const calculateExternalLotteryWeights = (
  applications: ExternalLotteryWeightInput[]
): Map<string, number> => {
  const slackValues = applications.map((application) => application.schedulingSlackMinutes);
  const fairnessValues = applications.map((application) => application.fairnessScore);
  return new Map(applications.map((application) => [
    application.id,
    1
      + 2 * getRelativeLotteryAdvantage(application.schedulingSlackMinutes, slackValues)
      + 2 * getRelativeLotteryAdvantage(application.fairnessScore, fairnessValues),
  ]));
};

export const getExternalLotteryWeightedOrderKey = (weight: number, randomUnit: number): number => {
  const boundedRandom = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, randomUnit));
  return -Math.log(boundedRandom) / weight;
};

const ExternalLotteryTimeRequestSchema = z.object({
  preferred_start_datetime: ValidDateTimeStringSchema.nullable(),
  preferred_end_datetime: ValidDateTimeStringSchema.nullable(),
  requested_duration_minutes: z.number().int()
    .min(EXTERNAL_LOTTERY_MIN_DURATION_MINUTES)
    .max(EXTERNAL_LOTTERY_MAX_DURATION_MINUTES),
}).superRefine((data, ctx) => {
  const hasStart = data.preferred_start_datetime !== null;
  const hasEnd = data.preferred_end_datetime !== null;
  if (hasStart !== hasEnd) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '許容時間の起点と終点は両方指定してください。' });
    return;
  }
  if (!hasStart || !hasEnd) return;

  const start = new Date(data.preferred_start_datetime as string);
  const end = new Date(data.preferred_end_datetime as string);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '許容時間の終点は起点より後にしてください。' });
    return;
  }
  const todayJST = getJSTDateString(new Date());
  const earliest = new Date(`${todayJST}T00:00:00+09:00`);
  earliest.setUTCDate(earliest.getUTCDate() + 1);
  const latest = new Date(`${todayJST}T00:00:00+09:00`);
  latest.setUTCDate(latest.getUTCDate() + 14);
  const targetDay = new Date(`${getJSTDateString(start)}T00:00:00+09:00`);
  if (targetDay < earliest || targetDay > latest) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '抽選対象日は翌日から14日先までです。' });
  }
  const windowMinutes = (end.getTime() - start.getTime()) / 60000;
  if (data.requested_duration_minutes > windowMinutes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '希望利用時間は許容時間内にしてください。' });
  }
});

export const CreateExternalLotteryApplicationRequestSchema = ExternalLotteryTimeRequestSchema.safeExtend({
  external_studio_id: UuidSchema,
  group_id: UuidSchema.nullable().optional(),
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

export const validateReservationTime = (
  startTime: string,
  endTime: string,
  nowValue: Date | string = new Date()
): { isValid: boolean; error?: string } => {
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
    if (end <= new Date(nowValue)) {
      return { isValid: false, error: "終了済みの時間は予約できません。" };
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

export const validateExternalReservationTime = (
  startTime: string,
  endTime: string,
  nowValue: Date | string = new Date()
): { isValid: boolean; error?: string } => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { isValid: false, error: "無効な日時形式です。" };
  }
  if (start >= end) {
    return { isValid: false, error: "終了日時は開始日時より後である必要があります。" };
  }
  if (end <= new Date(nowValue)) {
    return { isValid: false, error: "終了済みの時間は予約できません。" };
  }
  const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
  if (durationMinutes < 10) {
    return { isValid: false, error: "利用時間は最短10分です。" };
  }
  if (durationMinutes > 240) {
    return { isValid: false, error: "利用時間は最長4時間です。" };
  }
  return { isValid: true };
};

export const isReservationDateValid = (date: Date): boolean => {
  const selectedKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const todayKey = formatter.format(new Date());
  const maxDate = new Date(`${todayKey}T00:00:00+09:00`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 14);
  return selectedKey >= todayKey && selectedKey <= formatter.format(maxDate);
};

export const isReservationTimeValid = (date: Date, hour: number, minute: number): boolean => {
  const dateKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const selectedDate = new Date(`${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`);
  return selectedDate >= new Date() && hour >= 6 && !(hour === 23 && minute > 0);
};

const YoutubeUrlSchema = z.string().trim().regex(
  /^https:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/.+|youtu\.be\/[a-zA-Z0-9_-]{11}(?:[/?#].*)?)$/i,
  "有効なYouTube URLを入力してください。",
);
const ArchiveYearSchema = z.number().int().min(1900).max(9999);

export const CreateArchiveRequestSchema = z.object({
  title: z.string().trim().min(1),
  youtube_url: YoutubeUrlSchema,
  year: ArchiveYearSchema,
});

export const UpdateArchiveRequestSchema = z.object({
  title: z.string().trim().min(1),
  youtube_url: YoutubeUrlSchema,
  year: ArchiveYearSchema,
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
  start_datetime: ValidDateTimeStringSchema,
  end_datetime: ValidDateTimeStringSchema,
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
  start_datetime: ValidDateTimeStringSchema.optional(),
  end_datetime: ValidDateTimeStringSchema.optional(),
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
  id: UuidSchema,
  event_id: UuidSchema,
  group_id: UuidSchema,
  note: z.string().nullable(),
});

export const CreateEntryRequestSchema = z.object({
  event_id: UuidSchema,
  group_ids: z.array(UuidSchema),
  admin: z.boolean().optional(),
});

export const UpdateEntryRequestSchema = z.object({
  note: z.string().nullable(),
});

export const TimelineItemSchema = z.object({
  entry_id: UuidSchema,
  group_id: UuidSchema,
  group_name: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  position: z.number().nullable(),
  is_virtual: z.boolean().optional(),
});

export const GetTimelineResponseSchema = z.object({
  configured: z.array(TimelineItemSchema),
  unconfigured: z.array(TimelineItemSchema),
});

export const UpdateTimelineRequestSchema = z.object({
  items: z.array(z.object({
    entry_id: UuidSchema,
    position: z.number().int().min(1).nullable(),
    start_time: z.string().datetime().nullable().optional(),
    end_time: z.string().datetime().nullable().optional(),
  })),
});

export const SetlistItemSchema = z.object({
  id: UuidSchema,
  entry_id: UuidSchema,
  position: z.number(),
  title: z.string(),
  artist: z.string(),
});

export const CreateSetlistItemRequestSchema = z.object({
  entry_id: UuidSchema,
  position: z.number().int().min(0).max(100),
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
  note: z.string().nullable(),
  admin: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.hasSE && data.items.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: '入場SEの情報が必要です。' });
  }
});

export const EventSetlistBundleItemSchema = z.object({
  entry: z.object({
    id: UuidSchema,
    event_id: UuidSchema,
    group_id: UuidSchema,
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
export type ReservationState = z.infer<typeof ReservationStateSchema>;
export type External = z.infer<typeof ExternalSchema>;
export type LotteryTargetType = z.infer<typeof LotteryTargetTypeSchema>;
export type ExternalReservation = z.infer<typeof ExternalReservationSchema>;
export type ExternalReservationConflict = z.infer<typeof ExternalReservationConflictSchema>;
export type ExternalLotteryState = z.infer<typeof ExternalLotteryStateSchema>;
export type ExternalLotteryApplication = z.infer<typeof ExternalLotteryApplicationSchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type UserHolderResponse = z.infer<typeof UserHolderResponseSchema>;
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;
export type DeleteGroupsRequest = z.infer<typeof DeleteGroupsRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type EmailNotificationType = z.infer<typeof EmailNotificationTypeSchema>;
export type EmailNotificationPreferences = z.infer<typeof EmailNotificationPreferencesSchema>;
export type UpdateEmailNotificationPreferenceRequest = z.infer<typeof UpdateEmailNotificationPreferenceRequestSchema>;
export type AddMemberToGroupRequest = z.infer<typeof AddMemberToGroupRequestSchema>;
export type AssignmentMap = z.infer<typeof AssignmentMapSchema>;
export type CreateReservationRequest = z.infer<typeof CreateReservationRequestSchema>;
export type UpdateReservationRequest = z.infer<typeof UpdateReservationRequestSchema>;
export type UpdateReservationStatusRequest = z.infer<typeof UpdateReservationStatusRequestSchema>;
export type CreateExternalRequest = z.infer<typeof CreateExternalRequestSchema>;
export type CreateExternalReservationRequest = z.infer<typeof CreateExternalReservationRequestSchema>;
export type UpdateExternalReservationRequest = z.infer<typeof UpdateExternalReservationRequestSchema>;
export type CheckExternalReservationRequest = z.infer<typeof CheckExternalReservationRequestSchema>;
export type CreateExternalLotteryApplicationRequest = z.infer<typeof CreateExternalLotteryApplicationRequestSchema>;
export type CreateArchiveRequest = z.infer<typeof CreateArchiveRequestSchema>;
export type UpdateArchiveRequest = z.infer<typeof UpdateArchiveRequestSchema>;
export type Event = z.infer<typeof EventSchema>;
export type DashboardMemberAction = z.infer<typeof DashboardMemberActionSchema>;
export type DashboardAdminAction = z.infer<typeof DashboardAdminActionSchema>;
export type DashboardScheduleItem = z.infer<typeof DashboardScheduleItemSchema>;
export type DashboardData = z.infer<typeof DashboardDataSchema>;
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

export interface CreateEntriesResponse extends ApiResponse<void> {
  members?: string[];
}
