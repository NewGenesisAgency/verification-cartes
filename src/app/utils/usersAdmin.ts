/**
 * Appels à l'Edge Function `manage-users` (création/édition/suppression de
 * comptes). La fonction tourne avec la clé service_role et vérifie côté serveur
 * que l'appelant possède la permission `manage_accounts`.
 */

import { supabase } from './supabase';
import type { Permissions } from '../hooks/useProfile';

export interface ManagedUser {
    id: string;
    email: string;
    role: string;
    permissions: Partial<Permissions>;
    created_at: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
    if (!supabase) throw new Error('Supabase non configuré');
    const { data, error } = await supabase.functions.invoke('manage-users', { body });
    if (error) {
        // Tente de récupérer le message d'erreur renvoyé par la fonction.
        try {
            const ctx = (error as { context?: Response }).context;
            if (ctx) {
                const j = await ctx.json();
                if (j?.error) throw new Error(j.error);
            }
        } catch { /* ignore */ }
        throw new Error(error.message);
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
}

export async function listUsers(): Promise<ManagedUser[]> {
    const data = await invoke<{ users: ManagedUser[] }>({ action: 'list' });
    return data.users ?? [];
}

export async function createUser(email: string, password: string, permissions: Partial<Permissions>): Promise<void> {
    await invoke({ action: 'create', email, password, permissions });
}

export async function updateUser(id: string, changes: { permissions?: Partial<Permissions>; password?: string }): Promise<void> {
    await invoke({ action: 'update', id, ...changes });
}

export async function deleteUser(id: string): Promise<void> {
    await invoke({ action: 'delete', id });
}
