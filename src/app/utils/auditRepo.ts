/**
 * Journal d'audit des actions admin (import base, effacement historique).
 * Écriture/lecture réservées aux admins par RLS.
 */

import { supabase } from './supabase';

export interface AuditEntry {
    actor_email: string | null;
    action: string;
    details: Record<string, unknown> | null;
    created_at: string;
}

/** Journalise une action (silencieux si Supabase indisponible). */
export async function logAudit(action: string, details?: Record<string, unknown>): Promise<void> {
    if (!supabase) return;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('audit_log').insert({
            actor_email: user?.email ?? null,
            action,
            details: details ?? null,
        });
    } catch {
        // l'audit ne doit jamais bloquer l'action métier
    }
}

/** Récupère les dernières entrées du journal (admins uniquement). */
export async function fetchAudit(limit = 50): Promise<AuditEntry[] | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('audit_log')
        .select('actor_email,action,details,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error || !data) return null;
    return data as AuditEntry[];
}
