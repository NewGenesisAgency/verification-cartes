import { supabase } from './supabase';
import { localApi } from './localApi';

export interface Student {
    nom: string;
    prenom: string;
    classe: string;
    eligible?: string;
    numero?: string;
}

/** Charge tous les élèves. Supabase en priorité, SQLite local en repli. */
export async function fetchStudents(): Promise<Student[] | null> {
    if (supabase) {
        const { data, error } = await supabase
            .from('students')
            .select('nom,prenom,classe,numero,eligible');
        if (error || !data) return null;
        return data.map((r) => ({
            nom: r.nom || '',
            prenom: r.prenom || '',
            classe: r.classe || '',
            numero: r.numero ? String(r.numero) : '',
            eligible: r.eligible ? 'oui' : 'non',
        }));
    }
    try {
        const data = await localApi.get<Student[]>('/students');
        return data.length > 0 ? data : null;
    } catch { return null; }
}

/** Remplace toute la base élèves (import Excel). */
export async function replaceAllStudents(students: Student[]): Promise<boolean> {
    if (supabase) {
        const rows = students.map((s) => ({
            nom: s.nom,
            prenom: s.prenom,
            classe: s.classe,
            numero: s.numero || null,
            eligible: (s.eligible || '').toLowerCase() === 'oui',
        }));
        const del = await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (del.error) return false;
        if (rows.length === 0) return true;
        const { error } = await supabase.from('students').insert(rows);
        return !error;
    }
    try {
        await localApi.post('/students', { students });
        return true;
    } catch { return false; }
}
