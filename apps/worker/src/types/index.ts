export interface User {
  id: string;
  student_number: string;
  name: string;
  nickname?: string;
  email: string;
  instruments: string[]; // JSON array of instruments
  grade: string;
  role: 'ADMIN' | 'MBR';
  image?: string;
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
  creator: string;
  group_id?: string;
  start_time: string;
  end_time: string;
  notes?: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

export interface Archive {
  id: string;
  group_id: string;
  title: string;
  description?: string;
  youtube_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}