/**
 * Accès aux élèves dans Supabase (avec mapping vers le type de l'app).
 * `eligible` est un booléen en base ; l'app utilise 'oui'/'non'.
 */

import { supabase } from './supabase';

export interface Student {
    nom: string;
    prenom: string;
    classe: string;
    eligible?: string;
    numero?: string;
}

/** Charge tous les élèves depuis Supabase. `null` si indisponible (→ repli local). */
export async function fetchStudents(): Promise<Student[] | null> {
    if (!supabase) return null;
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

/** Remplace toute la base élèves (utilisé à l'import Excel). */
export async function replaceAllStudents(students: Student[]): Promise<boolean> {
    if (!supabase) return false;
    const rows = students.map((s) => ({
        nom: s.nom,
        prenom: s.prenom,
        classe: s.classe,
        numero: s.numero || null,
        eligible: (s.eligible || '').toLowerCase() === 'oui',
    }));
    // Supprime l'existant puis insère (RLS : réservé aux agents authentifiés).
    const del = await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del.error) return false;
    if (rows.length === 0) return true;
    const { error } = await supabase.from('students').insert(rows);
    return !error;
}
