import { z } from 'zod';

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
  instruments: z.array(z.string()),
  student_number: z.string(),
});

export const GoogleUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().url().optional(),
  verified_email: z.boolean().optional(),
  email_verified: z.boolean().optional(),
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

export const GroupMemberSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  user_id: z.string(),
  role: z.string().nullable(),
  created_at: z.string(),
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
  start_time: z.string(),
  end_time: z.string(),
  holder_user_id: z.string().nullable(),
  holder_group_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const ArchiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  youtube_url: z.string().nullable(),
  year: z.number(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const CreateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.string().optional(),
  is_main: z.boolean().optional(),
});

export const UpdateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.string().optional(),
  is_main: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const UpdateUserRequestSchema = z.object({
  nickname: z.string(),
  instruments: z.array(z.string()),
});

export const AddMemberToGroupRequestSchema = z.object({
  user_id: z.string(),
  role: z.string().optional(),
});

export const CreateReservationRequestSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  holder_user_id: z.string().optional(),
  holder_group_id: z.string().optional(),
});

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

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

export const GoogleTokenResponseSchema = z.object({
  access_token: z.string(),
  id_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number(),
});

export const GoogleJWKSchema = z.object({
  keys: z.array(z.object({
    kid: z.string(),
    alg: z.string(),
    kty: z.string(),
    use: z.string(),
    n: z.string(),
    e: z.string(),
  })),
});

export const GoogleIdTokenPayloadSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string(),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url().optional(),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().optional(),
});

export type User = z.infer<typeof UserSchema>;
export type UserWithInstruments = z.infer<typeof UserWithInstrumentsSchema>;
export type GoogleUser = z.infer<typeof GoogleUserSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type GroupMember = z.infer<typeof GroupMemberSchema>;
export type GroupWithMemberRole = z.infer<typeof GroupWithMemberRoleSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type AddMemberToGroupRequest = z.infer<typeof AddMemberToGroupRequestSchema>;
export type CreateReservationRequest = z.infer<typeof CreateReservationRequestSchema>;
export type CreateArchiveRequest = z.infer<typeof CreateArchiveRequestSchema>;
export type UpdateArchiveRequest = z.infer<typeof UpdateArchiveRequestSchema>;
export type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;
export type GoogleJWKS = z.infer<typeof GoogleJWKSchema>;
export type GoogleIdTokenPayload = z.infer<typeof GoogleIdTokenPayloadSchema>;
