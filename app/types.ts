export enum Instrument {
    vocal = 'VO',
    guitar = 'GT',
    keyboard = 'KEY',
    drums = 'DR',
    bass = 'BA',
}

export enum Role {
    manager = 'MGR',
    deputy_manager = 'DMGR',
    accountant = 'ACC',
    member = 'MBR',
    admin = 'ADM',
}

export interface UserData {
    student_number: string;
    grade: string;
    name: string;
    email: string;
    nickname: string | null;
    instruments: Instrument[];
}
