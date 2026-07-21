import { z } from 'zod';
import * as SharedSchemas from '../../../../lib/shared-schemas';

export const {
  UserSchema,
  UserWithInstrumentsSchema,
  GroupSchema,
  GroupWithMemberRoleSchema,
  MemberSchema,
  ReservationSchema,
  ReservationLimitSchema,
  ReservationLimitRemainingSchema,
  ReservationLimitScopeSchema,
  ReservationLimitTypeSchema,
  ArchiveSchema,
  CreateGroupRequestSchema,
  UpdateGroupRequestSchema,
  DeleteGroupsRequestSchema,
  UpdateUserRequestSchema,
  EmailNotificationTypeSchema,
  EmailNotificationPreferencesSchema,
  UpdateEmailNotificationPreferenceRequestSchema,
  AddMemberToGroupRequestSchema,
  CreateReservationRequestSchema,
  CreateReservationLimitRequestSchema,
  UpdateReservationLimitRequestSchema,
  CreateArchiveRequestSchema,
  UpdateArchiveRequestSchema,
  ApiResponseSchema,
} = SharedSchemas;

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

export const GroupMemberSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  user_id: z.string(),
  role: z.string().nullable(),
  created_at: z.string(),
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

export type User = SharedSchemas.User;
export type UserWithInstruments = SharedSchemas.UserWithInstruments;
export type Group = SharedSchemas.Group;
export type GroupWithMemberRole = SharedSchemas.GroupWithMemberRole;
export type Member = SharedSchemas.Member;
export type Reservation = SharedSchemas.Reservation;
export type ReservationLimitScope = SharedSchemas.ReservationLimitScope;
export type ReservationLimitType = SharedSchemas.ReservationLimitType;
export type ReservationLimit = SharedSchemas.ReservationLimit;
export type ReservationLimitRemaining = SharedSchemas.ReservationLimitRemaining;
export type Archive = SharedSchemas.Archive;
export type CreateGroupRequest = SharedSchemas.CreateGroupRequest;
export type UpdateGroupRequest = SharedSchemas.UpdateGroupRequest;
export type DeleteGroupsRequest = SharedSchemas.DeleteGroupsRequest;
export type UpdateUserRequest = SharedSchemas.UpdateUserRequest;
export type AddMemberToGroupRequest = SharedSchemas.AddMemberToGroupRequest;
export type CreateReservationRequest = SharedSchemas.CreateReservationRequest;
export type CreateReservationLimitRequest = SharedSchemas.CreateReservationLimitRequest;
export type UpdateReservationLimitRequest = SharedSchemas.UpdateReservationLimitRequest;
export type CreateArchiveRequest = SharedSchemas.CreateArchiveRequest;
export type UpdateArchiveRequest = SharedSchemas.UpdateArchiveRequest;
export type ApiResponse<T> = SharedSchemas.ApiResponse<T>;

export type GoogleUser = z.infer<typeof GoogleUserSchema>;
export type GroupMember = z.infer<typeof GroupMemberSchema>;
export type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;
export type GoogleJWKS = z.infer<typeof GoogleJWKSchema>;
export type GoogleIdTokenPayload = z.infer<typeof GoogleIdTokenPayloadSchema>;
