import { z } from 'zod';
import { Instrument, Role } from '@/app/types';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  nickname: z.string().nullable(),
  instruments: z.array(z.string()),
  grade: z.number(),
  role: z.string(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const UserWithInstrumentsSchema = UserSchema.extend({
  student_number: z.string(),
});

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  assignments: z.string().nullable(),
  is_main: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const GroupWithMemberRoleSchema = GroupSchema.extend({
  member_role: z.string().nullable(),
});

export const MemberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  nickname: z.string().nullable(),
  instruments: z.array(z.string()),
  student_number: z.string(),
});

export const ReservationSchema = z.object({
  id: z.number(),
  booked_by: z.string(),
  booked_by_name: z.string().nullable(),
  creator_name: z.string().nullable(),
  holder_group_name: z.string().nullable(),
  holder_user_id: z.string().nullable(),
  holder_group_id: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  state: z.string(),
  cancellable: z.number(),
});

export const ArchiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  youtube_url: z.string().nullable(),
  year: z.number(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const MemberListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  nickname: z.string().nullable(),
  email: z.string().email(),
  grade: z.number(),
  instruments: z.array(z.nativeEnum(Instrument)),
  role: z.nativeEnum(Role),
  groups: z.array(z.string()),
  student_number: z.string(),
});

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

export const SessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    picture: z.string().optional(),
  }).nullable(),
});

export const UserHolderResponseSchema = z.object({
  user: UserWithInstrumentsSchema,
  bands: z.array(GroupWithMemberRoleSchema),
});

export type User = z.infer<typeof UserSchema>;
export type UserWithInstruments = z.infer<typeof UserWithInstrumentsSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type GroupWithMemberRole = z.infer<typeof GroupWithMemberRoleSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type MemberListItem = z.infer<typeof MemberListItemSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type UserHolderResponse = z.infer<typeof UserHolderResponseSchema>;
