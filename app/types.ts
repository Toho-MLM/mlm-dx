export enum Instrument {
    VOCAL = 'VOCAL',
    KEYBOARD = 'KEYBOARD',
    GUITAR = 'GUITAR',
    DRUM = 'DRUM',
    BASS = 'BASS',
}

export interface UserData {
    student_number: string;
    email: string;
    name: string;
    nickname: string | null;
    instruments: Instrument[];
}
