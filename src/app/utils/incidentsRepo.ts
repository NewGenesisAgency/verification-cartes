import { supabase } from './supabase';
import { localApi } from './localApi';

export type IncidentType = 'blame' | 'incident';

export interface IncidentInput {
    type: IncidentType;
    severity?: number;
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
    if (supabase) {
        const { error } = await supabase.from('incidents').insert({
            type: input.type, severity: input.severity ?? null,
            student_qr: input.student_qr ?? null, nom: input.nom,
            prenom: input.prenom, classe: input.classe, description: input.description,
        });
        if (error) throw new Error(error.message);
        return;
    }
    await localApi.post('/incidents', input);
}

export async function fetchIncidents(): Promise<IncidentRow[]> {
    if (supabase) {
        const { data, error } = await supabase
            .from('incidents')
            .select('id,type,severity,student_qr,nom,prenom,classe,description,created_by_email,created_at')
            .order('created_at', { ascending: false });
        if (error || !data) return [];
        return data as IncidentRow[];
    }
    try { return await localApi.get<IncidentRow[]>('/incidents'); }
    catch { return []; }
}

export async function deleteIncident(id: string): Promise<void> {
    if (supabase) {
        const { error } = await supabase.from('incidents').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return;
    }
    await localApi.delete(`/incidents?id=${encodeURIComponent(id)}`);
}
