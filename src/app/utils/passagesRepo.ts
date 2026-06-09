/**
 * Enregistrement des passages dans Supabase, avec file d'attente offline :
 * si l'insertion échoue (réseau coupé), le passage est mis en file dans
 * localStorage et rejoué plus tard via `flushPassageQueue`.
 */

import { supabase } from './supabase';
import { debugLog } from './debug';

export interface PassageInput {
    nom: string;
    prenom: string;
    classe: string;
    eligible: boolean;
    statut: string;        // 'Accepté' | 'Refusé'
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
    } catch {
        // localStorage plein / indisponible : on abandonne ce passage en file.
    }
}

/** Enregistre un passage (Supabase si possible, sinon file offline). */
export async function recordPassage(passage: PassageInput): Promise<void> {
    if (!supabase) {
        enqueue(passage);
        return;
    }
    const { error } = await supabase.from('passages').insert({
        nom: passage.nom,
        prenom: passage.prenom,
        classe: passage.classe,
        eligible: passage.eligible,
        statut: passage.statut,
        source: passage.source,
        borne: BORNE_ID,
    });
    if (error) {
        debugLog('Passage mis en file (offline):', error.message);
        enqueue(passage);
    }
}

/** Rejoue les passages en file d'attente (à appeler quand on est en ligne). */
export async function flushPassageQueue(): Promise<void> {
    if (!supabase) return;
    let queue: PassageRow[] = [];
    try {
        queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch {
        return;
    }
    if (queue.length === 0) return;

    const { error } = await supabase.from('passages').insert(
        queue.map((p) => ({
            nom: p.nom,
            prenom: p.prenom,
            classe: p.classe,
            eligible: p.eligible,
            statut: p.statut,
            source: p.source,
            borne: p.borne || BORNE_ID,
            scanned_at: p.scanned_at,
        })),
    );
    if (!error) {
        localStorage.removeItem(QUEUE_KEY);
        debugLog(`File de passages synchronisée (${queue.length}).`);
    }
}

/** Supprime tout l'historique des passages (Supabase). */
export async function deleteAllPassages(): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
        .from('passages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    return !error;
}

/** Charge l'historique des passages depuis Supabase. */
export async function fetchPassages(): Promise<PassageRow[] | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('passages')
        .select('nom,prenom,classe,eligible,statut,source,borne,scanned_at')
        .order('scanned_at', { ascending: false });
    if (error || !data) return null;
    return data as PassageRow[];
}
