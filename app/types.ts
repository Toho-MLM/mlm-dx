export enum Instrument {
    vocal = 'VO',
    guitar = 'GT',
    keyboard = 'KEY',
    drums = 'DR',
    bass = 'BA',
}

export enum Role {
    manager = 'MGR',
    chief = 'CHF',
    nursing_head = 'NHD',
    medical_accountant = 'MACT',
    nursing_accountant = 'NACT',
    member = 'MBR',
    admin = 'ADM',
}

export interface UserData {
    student_number: string;
    grade: string;
    name: string;
    role: Role;
    email: string;
    nickname: string | null;
    instruments: Instrument[];
}

export type MemberListItem = Omit<UserData, 'email'>;

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
    creator: string;
    group: string | null;
    start_time: Date;
    end_time: Date;
    options?: string | null;
    state: ReservationState;
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
    assignments: GroupMember[]
}

export const instrumentColors: Record<Instrument, string> = {
    [Instrument.vocal]: 'bg-blue-100 text-blue-800',
    [Instrument.guitar]: 'bg-green-100 text-green-800',
    [Instrument.keyboard]: 'bg-purple-100 text-purple-800',
    [Instrument.drums]: 'bg-yellow-100 text-yellow-800',
    [Instrument.bass]: 'bg-red-100 text-red-800',
}