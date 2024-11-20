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

export type MemberData = Omit<UserData, 'email'>;

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
    id: number;
    creator: string;
    group?: string | null;
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

