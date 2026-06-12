import { supabase } from './supabase';

export type IncidentType = 'blame' | 'incident';

export interface IncidentInput {
    type: IncidentType;
    severity?: number;      // 1-3, blâme uniquement
    student_qr?: string;
    nom: string;
    prenom: string;
    classe: string;
    description: string;
}

export interface IncidentRow extends IncidentInput {
    id: string;
    created_by_email?: string;
    created_at: string;
}

export async function createIncident(input: IncidentInput): Promise<void> {
    if (!supabase) throw new Error('Supabase non configuré');
    const { error } = await supabase.from('incidents').insert({
        type: input.type,
        severity: input.severity ?? null,
        student_qr: input.student_qr ?? null,
        nom: input.nom,
        prenom: input.prenom,
        classe: input.classe,
        description: input.description,
    });
    if (error) throw new Error(error.message);
}

export async function fetchIncidents(): Promise<IncidentRow[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('incidents')
        .select('id,type,severity,student_qr,nom,prenom,classe,description,created_by_email,created_at')
        .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as IncidentRow[];
}

export async function deleteIncident(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase non configuré');
    const { error } = await supabase.from('incidents').delete().eq('id', id);
    if (error) throw new Error(error.message);
}
