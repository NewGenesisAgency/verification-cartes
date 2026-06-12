import { supabase } from './supabase';
import { localApi } from './localApi';
import { debugLog } from './debug';

export interface PassageInput {
    nom: string;
    prenom: string;
    classe: string;
    eligible: boolean;
    statut: string;
    source: 'qr' | 'ocr' | 'manual';
}

export interface PassageRow extends PassageInput {
    borne: string;
    scanned_at: string;
}

const QUEUE_KEY = 'mdl_passage_queue';
const BORNE_ID = process.env.NEXT_PUBLIC_BORNE_ID || 'borne-1';

function enqueue(passage: PassageInput) {
    try {
        const queue: PassageRow[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        queue.push({ ...passage, borne: BORNE_ID, scanned_at: new Date().toISOString() });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch { /* localStorage indisponible */ }
}

/** Enregistre un passage. Supabase → SQLite local → file offline. */
export async function recordPassage(passage: PassageInput): Promise<void> {
    if (supabase) {
        const { error } = await supabase.from('passages').insert({
            nom: passage.nom, prenom: passage.prenom, classe: passage.classe,
            eligible: passage.eligible, statut: passage.statut, source: passage.source,
            borne: BORNE_ID,
        });
        if (error) { debugLog('Passage mis en file (offline):', error.message); enqueue(passage); }
        return;
    }
    try {
        await localApi.post('/passages', { ...passage, borne: BORNE_ID });
    } catch { enqueue(passage); }
}

/** Rejoue les passages en file d'attente. */
export async function flushPassageQueue(): Promise<void> {
    let queue: PassageRow[] = [];
    try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return; }
    if (queue.length === 0) return;

    if (supabase) {
        const { error } = await supabase.from('passages').insert(
            queue.map((p) => ({ nom: p.nom, prenom: p.prenom, classe: p.classe, eligible: p.eligible, statut: p.statut, source: p.source, borne: p.borne || BORNE_ID, scanned_at: p.scanned_at }))
        );
        if (!error) { localStorage.removeItem(QUEUE_KEY); debugLog(`File synchronisée (${queue.length}).`); }
        return;
    }
    try {
        for (const p of queue) await localApi.post('/passages', p);
        localStorage.removeItem(QUEUE_KEY);
        debugLog(`File SQLite synchronisée (${queue.length}).`);
    } catch { /* retry plus tard */ }
}

/** Supprime tout l'historique. */
export async function deleteAllPassages(): Promise<boolean> {
    if (supabase) {
        const { error } = await supabase.from('passages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        return !error;
    }
    try { await localApi.delete('/passages'); return true; } catch { return false; }
}

/** Charge l'historique des passages. */
export async function fetchPassages(): Promise<PassageRow[] | null> {
    if (supabase) {
        const { data, error } = await supabase
            .from('passages')
            .select('nom,prenom,classe,eligible,statut,source,borne,scanned_at')
            .order('scanned_at', { ascending: false });
        if (error || !data) return null;
        return data as PassageRow[];
    }
    try { return await localApi.get<PassageRow[]>('/passages'); }
    catch { return null; }
}
