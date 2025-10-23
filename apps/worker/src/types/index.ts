export interface User {
  id: string;
  name: string;
  nickname?: string;
  email: string;
  instruments: ('VO' | 'GT' | 'KEY' | 'DR' | 'BA')[];
  grade: number;
  role: 'MGR' | 'CHF' | 'MAC' | 'MBR' | 'ADM' | 'NHD' | 'NAC';
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id?: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: Date | null;
}

export interface AuthAccount {
  userId: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

export interface AuthSession {
  sessionToken: string;
  userId: string;
  expires: Date;
}

export interface AuthVerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}

export interface Group {
  id: string;
  name: string;
  assignments?: unknown; // JSON object
  is_main: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export interface Reservation {
  id: number;
  booked_by: string;
  holder_user_id?: string;
  holder_group_id?: string;
  start_time: string;
  end_time: string;
  state: 'PENDING' | 'WITHDRAWN' | 'DECLINED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  created_at: string;
  updated_at: string;
}

export interface Archive {
  id: string;
  title: string;
  youtube_url?: string;
  year: number;
  created_at: string;
  updated_at: string;
}

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};