import { z } from 'zod';
import { Instrument, Role } from '@/app/types';
import * as SharedSchemas from '../../../lib/shared-schemas';

export const {
  UserSchema,
  UserWithInstrumentsSchema,
  GroupSchema,
  GroupWithMemberRoleSchema,
  MemberSchema,
  ReservationSchema,
  ExternalSchema,
  ExternalReservationSchema,
  ExternalReservationConflictSchema,
  ArchiveSchema,
  SessionResponseSchema,
  UserHolderResponseSchema,
  CreateGroupRequestSchema,
  UpdateGroupRequestSchema,
  UpdateUserRequestSchema,
  AddMemberToGroupRequestSchema,
  CreateReservationRequestSchema,
  CreateExternalRequestSchema,
  CreateExternalReservationRequestSchema,
  CheckExternalReservationRequestSchema,
  CreateArchiveRequestSchema,
  UpdateArchiveRequestSchema,
  ApiResponseSchema,
} = SharedSchemas;

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

export type User = SharedSchemas.User;
export type UserWithInstruments = SharedSchemas.UserWithInstruments;
export type Group = SharedSchemas.Group;
export type GroupWithMemberRole = SharedSchemas.GroupWithMemberRole;
export type Member = SharedSchemas.Member;
export type MemberListItem = z.infer<typeof MemberListItemSchema>;
export type Reservation = SharedSchemas.Reservation;
export type External = SharedSchemas.External;
export type ExternalReservation = SharedSchemas.ExternalReservation;
export type ExternalReservationConflict = SharedSchemas.ExternalReservationConflict;
export type Archive = SharedSchemas.Archive;
export type SessionResponse = SharedSchemas.SessionResponse;
export type UserHolderResponse = SharedSchemas.UserHolderResponse;
export type CreateGroupRequest = SharedSchemas.CreateGroupRequest;
export type UpdateGroupRequest = SharedSchemas.UpdateGroupRequest;
export type UpdateUserRequest = SharedSchemas.UpdateUserRequest;
export type AddMemberToGroupRequest = SharedSchemas.AddMemberToGroupRequest;
export type CreateReservationRequest = SharedSchemas.CreateReservationRequest;
export type CreateExternalRequest = SharedSchemas.CreateExternalRequest;
export type CreateExternalReservationRequest = SharedSchemas.CreateExternalReservationRequest;
export type CheckExternalReservationRequest = SharedSchemas.CheckExternalReservationRequest;
export type CreateArchiveRequest = SharedSchemas.CreateArchiveRequest;
export type UpdateArchiveRequest = SharedSchemas.UpdateArchiveRequest;
export type ApiResponse<T> = SharedSchemas.ApiResponse<T>;
