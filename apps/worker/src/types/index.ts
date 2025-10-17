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

export interface Group {
  id: string;
  name: string;
  assignments?: any; // JSON object
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