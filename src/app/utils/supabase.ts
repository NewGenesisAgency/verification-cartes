/**
 * Client Supabase (navigateur).
 *
 * Si les variables d'environnement ne sont pas configurées, `supabase` vaut
 * `null` et l'application retombe sur son mode local (xlsx + localStorage) :
 * la borne continue de fonctionner même sans backend.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// IMPORTANT : on ne crée le client QUE dans le navigateur.
// Côté serveur (SSR), `persistSession` accéderait à `localStorage`, qui sous
// Node 22+ existe comme global expérimental cassé (--localstorage-file) →
// « localStorage.getItem is not a function ». Le client reste donc `null` côté
// serveur ; toutes nos utilisations sont gardées ou dans des effets client.
const isBrowser = typeof window !== 'undefined';

export const supabase: SupabaseClient | null = (isSupabaseConfigured && isBrowser)
    ? createClient(url!, key!, {
        auth: {
            persistSession: true,      // garde l'agent connecté entre les sessions
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    })
    : null;
