'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../utils/supabase';

export type PermissionKey =
    | 'scan'
    | 'view_stats'
    | 'export'
    | 'manage_students'
    | 'clear_history'
    | 'manage_accounts'
    | 'blame'
    | 'create_incident';

export type Permissions = Record<PermissionKey, boolean>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
    scan:             'Scanner',
    view_stats:       'Voir stats / historique',
    export:           'Exporter (CSV/PDF)',
    manage_students:  'Gérer la base élèves',
    clear_history:    "Effacer l'historique",
    manage_accounts:  'Gérer les comptes',
    blame:            'Appliquer des blâmes',
    create_incident:  'Créer des incidents',
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

/** Permissions prédéfinies par rôle. */
export const ROLE_PRESETS: Record<string, { label: string; color: string; permissions: Partial<Permissions> }> = {
    super_admin: {
        label: 'Super Administrateur',
        color: 'violet',
        permissions: {
            scan: true, view_stats: true, export: true,
            manage_students: true, clear_history: true, manage_accounts: true,
            blame: true, create_incident: true,
        },
    },
    bureau: {
        label: 'Membre du Bureau',
        color: 'blue',
        permissions: {
            scan: true, view_stats: true, export: true,
            manage_students: true, clear_history: true, manage_accounts: false,
            blame: true, create_incident: true,
        },
    },
    gerant: {
        label: 'Gérant',
        color: 'emerald',
        permissions: {
            scan: true, view_stats: true, export: false,
            manage_students: false, clear_history: false, manage_accounts: false,
            blame: false, create_incident: true,
        },
    },
};

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
