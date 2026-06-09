'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../utils/supabase';

export type PermissionKey =
    | 'scan'
    | 'view_stats'
    | 'export'
    | 'manage_students'
    | 'clear_history'
    | 'manage_accounts';

export type Permissions = Record<PermissionKey, boolean>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
    scan: 'Scanner',
    view_stats: 'Voir stats / historique',
    export: 'Exporter (CSV/PDF)',
    manage_students: 'Gérer la base élèves',
    clear_history: "Effacer l'historique",
    manage_accounts: 'Gérer les comptes',
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

/**
 * Permissions + email de l'agent connecté.
 * En mode local (Supabase non configuré), tous les droits sont accordés.
 */
export function useProfile() {
    const [permissions, setPermissions] = useState<Permissions | null>(null);
    const [email, setEmail] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const sb = supabase;
        if (!sb) {
            setLoading(false);
            return;
        }
        let active = true;
        (async () => {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) {
                if (active) setLoading(false);
                return;
            }
            if (active) setEmail(user.email ?? '');
            const { data } = await sb.from('profiles').select('permissions').eq('id', user.id).single();
            if (active) {
                setPermissions((data?.permissions as Permissions) ?? null);
                setLoading(false);
            }
        })();
        return () => { active = false; };
    }, []);

    const signOut = async () => {
        await supabase?.auth.signOut();
    };

    const can = useCallback(
        (perm: PermissionKey): boolean => (!isSupabaseConfigured ? true : Boolean(permissions?.[perm])),
        [permissions],
    );

    return { permissions, email, loading, can, signOut, isAdmin: can('manage_accounts') };
}
