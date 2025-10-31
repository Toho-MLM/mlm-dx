export enum Instrument {
    vocal = 'VO',
    guitar = 'GT',
    keyboard = 'KEY',
    drums = 'DR',
    bass = 'BA',
}

export enum Role {
    admin = 'ADM',
    manager = 'MGR',
    chief = 'CHF',
    medical_accountant = 'MAC',
    nursing_head = 'NHD',
    nursing_accountant = 'NAC',
    member = 'MBR',
}

export interface UserData {
    grade: number;
    name: string;
    role: Role;
    email: string;
    nickname: string | null;
    instruments: Instrument[];
    student_number?: string;
}

export interface User {
    id: string;
    name: string;
    nickname?: string;
    email: string;
    picture?: string;
    instruments: ('VO' | 'GT' | 'KEY' | 'DR' | 'BA')[];
    grade: number;
    role: 'MGR' | 'CHF' | 'MAC' | 'MBR' | 'ADM' | 'NHD' | 'NAC';
    created_at: string;
    updated_at: string;
}

export interface MemberListItem {
    id: string;
    name: string;
    nickname: string | null;
    email: string;
    grade: number;
    instruments: Instrument[];
    role: Role;
    groups: string[];
    student_number: string;
}

export const instrumentNames: Record<Instrument, string> = {
    [Instrument.vocal]: 'ボーカル',
    [Instrument.guitar]: 'ギター',
    [Instrument.keyboard]: 'キーボード',
    [Instrument.drums]: 'ドラム',
    [Instrument.bass]: 'ベース',
}

export const roleNames: Record<Role, string> = {
  [Role.manager]: '部長',
  [Role.chief]: '主務',
  [Role.nursing_head]: '看護部長',
  [Role.medical_accountant]: '医会計',
  [Role.nursing_accountant]: '看護会計',
  [Role.member]: '部員',
  [Role.admin]: '管理者',
}

export interface ReservationData {
    id: string;
    user_id: string;
    group_id: string | null;
    user_name?: string;
    group_name?: string;
    start: Date;
    end: Date;
    state: ReservationState;
    cancellable: number;
}

export enum ReservationState {
    PENDING = 'PENDING',
    WITHDRAWN = 'WITHDRAWN',
    DECLINED = 'DECLINED',
    CONFIRMED = 'CONFIRMED',
    CANCELLED = 'CANCELLED',
    COMPLETED = 'COMPLETED',
}

export interface ReservationHolder {
    name: string;
    id: string | null;
}

export const eventStateNames: Record<ReservationState, string> = {
    [ReservationState.PENDING]: '保留中',
    [ReservationState.WITHDRAWN]: '取り下げ',
    [ReservationState.DECLINED]: '却下',
    [ReservationState.CONFIRMED]: '確定',
    [ReservationState.CANCELLED]: 'キャンセル',
    [ReservationState.COMPLETED]: '完了',
}

export interface Member {
    id: string
    name: string
    instruments: Instrument[]
}

export interface GroupMember {
    id: string
    instruments: Instrument[]
}

export interface Group {
    id: string
    name: string
    isMain: boolean
    isActive: boolean
    assignments: GroupMember[]
}

export const instrumentColors: Record<Instrument, string> = {
    [Instrument.vocal]: 'bg-blue-100 text-blue-800',
    [Instrument.guitar]: 'bg-green-100 text-green-800',
    [Instrument.keyboard]: 'bg-purple-100 text-purple-800',
    [Instrument.drums]: 'bg-yellow-100 text-yellow-800',
    [Instrument.bass]: 'bg-red-100 text-red-800',
}

export const reservationStateColors: Record<ReservationState, string> = {
    [ReservationState.PENDING]: 'bg-yellow-100 text-yellow-800',
    [ReservationState.WITHDRAWN]: 'bg-gray-100 text-gray-800',
    [ReservationState.DECLINED]: 'bg-red-100 text-red-800',
    [ReservationState.CONFIRMED]: 'bg-green-100 text-green-800',
    [ReservationState.CANCELLED]: 'bg-gray-100 text-gray-800',
    [ReservationState.COMPLETED]: 'bg-gray-100 text-gray-800',
}

export interface Event {
    id: string
    title: string
    event_date: string
    entry_deadline: string
    is_entry_accepting: boolean
    setlist_deadline: string
    is_setlist_accepting: boolean
    group_limit: number
    song_limit: number
    created_at: string
    updated_at: string
}

export interface Entry {
    id: string
    event_id: string
    group_id: string
    note?: string | null
    created_at: string
}

export interface SetlistItem {
    id: string
    entry_id: string
    position: number
    title: string
    artist: string
    created_at: string
    updated_at: string
}


