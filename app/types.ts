export enum Instrument {
    VOCAL = 'VOCAL',
    KEYBOARD = 'KEYBOARD',
    GUITAR = 'GUITAR',
    DRUM = 'DRUM',
    BASS = 'BASS',
}

export interface UserData {
    student_number: string;
    grade: string;
    name: string;
    email: string;
    nickname: string | null;
    instruments: Instrument[];
}
