'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'next-view-transitions';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, UserPlus, Trash2, Save, KeyRound, Loader2, ShieldAlert, Users } from 'lucide-react';
import { useRevealer } from '../../hooks/useRevealer';
import { useProfile, ALL_PERMISSIONS, PERMISSION_LABELS, type PermissionKey, type Permissions } from '../../hooks/useProfile';
import { listUsers, createUser, updateUser, deleteUser, type ManagedUser } from '../../utils/usersAdmin';

const DEFAULT_NEW: Partial<Permissions> = {
    scan: true, view_stats: true, export: true,
    manage_students: false, clear_history: false, manage_accounts: false,
};

export default function ComptesPage() {
    useRevealer();
    const { can, loading: profileLoading, email: myEmail } = useProfile();

    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Formulaire de création
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPerms, setNewPerms] = useState<Partial<Permissions>>(DEFAULT_NEW);

    const reload = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setUsers(await listUsers());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur de chargement');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!profileLoading && can('manage_accounts')) void reload();
        else if (!profileLoading) setLoading(false);
    }, [profileLoading, can, reload]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await createUser(newEmail.trim(), newPassword, newPerms);
            setNewEmail('');
            setNewPassword('');
            setNewPerms(DEFAULT_NEW);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Création impossible');
        } finally {
            setBusy(false);
        }
    };

    const handleSavePerms = async (u: ManagedUser, perms: Partial<Permissions>) => {
        setBusy(true);
        setError('');
        try {
            await updateUser(u.id, { permissions: perms });
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Mise à jour impossible');
        } finally {
            setBusy(false);
        }
    };

    const handleResetPassword = async (u: ManagedUser) => {
        const pwd = prompt(`Nouveau mot de passe pour ${u.email} :`);
        if (!pwd) return;
        setBusy(true);
        setError('');
        try {
            await updateUser(u.id, { password: pwd });
            alert('Mot de passe mis à jour.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Réinitialisation impossible');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (u: ManagedUser) => {
        if (!confirm(`Supprimer le compte ${u.email} ?`)) return;
        setBusy(true);
        setError('');
        try {
            await deleteUser(u.id);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Suppression impossible');
        } finally {
            setBusy(false);
        }
    };

    if (profileLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (!can('manage_accounts')) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4 px-6 text-center">
                <ShieldAlert className="w-12 h-12 text-red-500" />
                <h1 className="text-xl font-bold text-black">Accès refusé</h1>
                <p className="text-gray-600">Vous n&apos;avez pas la permission de gérer les comptes.</p>
                <Link href="/verification-cartes" className="text-sm text-black underline">Retour</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 flex flex-col">
            <header className="backdrop-blur-2xl bg-white/60 border-b border-gray-200/50">
                <div className="container mx-auto px-6 py-4">
                    <Link href="/verification-cartes" className="inline-flex items-center text-gray-600 hover:text-black transition-colors mb-3">
                        <ArrowLeft className="w-4 h-4 mr-2" /><span className="text-sm font-medium">Retour</span>
                    </Link>
                    <h1 className="text-3xl font-bold text-black tracking-tight flex items-center gap-3">
                        <Users className="w-7 h-7" /> Gestion des comptes
                    </h1>
                </div>
            </header>

            <main className="flex-grow container mx-auto px-6 py-8 max-w-5xl">
                {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                        className="mb-6 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                        {error}
                    </motion.div>
                )}

                {/* Création */}
                <motion.form
                    onSubmit={handleCreate}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-10 backdrop-blur-2xl bg-white/60 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]"
                >
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <UserPlus className="w-5 h-5" /> Nouveau compte
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                        <input type="email" required placeholder="Email" value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
                        <input type="text" required minLength={6} placeholder="Mot de passe (min. 6)" value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
                    </div>
                    <PermissionChecks perms={newPerms} onChange={setNewPerms} />
                    <button type="submit" disabled={busy}
                        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 active:scale-95 transition disabled:opacity-60">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Créer le compte
                    </button>
                </motion.form>

                {/* Liste */}
                <div className="space-y-4">
                    <AnimatePresence>
                        {users.map((u, i) => (
                            <motion.div
                                key={u.id}
                                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                                transition={{ delay: i * 0.04 }}
                                className="backdrop-blur-2xl bg-white/60 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]"
                            >
                                <UserRow
                                    user={u}
                                    isSelf={u.email === myEmail}
                                    busy={busy}
                                    onSave={handleSavePerms}
                                    onResetPassword={handleResetPassword}
                                    onDelete={handleDelete}
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {users.length === 0 && <p className="text-center text-gray-400 py-8">Aucun compte.</p>}
                </div>
            </main>
        </div>
    );
}

function PermissionChecks({ perms, onChange }: { perms: Partial<Permissions>; onChange: (p: Partial<Permissions>) => void }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_PERMISSIONS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={Boolean(perms[key])}
                        onChange={(e) => onChange({ ...perms, [key]: e.target.checked })}
                        className="w-4 h-4 accent-black"
                    />
                    {PERMISSION_LABELS[key]}
                </label>
            ))}
        </div>
    );
}

function UserRow({ user, isSelf, busy, onSave, onResetPassword, onDelete }: {
    user: ManagedUser;
    isSelf: boolean;
    busy: boolean;
    onSave: (u: ManagedUser, perms: Partial<Permissions>) => void;
    onResetPassword: (u: ManagedUser) => void;
    onDelete: (u: ManagedUser) => void;
}) {
    const [perms, setPerms] = useState<Partial<Permissions>>(user.permissions ?? {});
    const dirty = (ALL_PERMISSIONS as PermissionKey[]).some(k => Boolean(perms[k]) !== Boolean(user.permissions?.[k]));

    return (
        <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                    <p className="font-semibold text-black">{user.email}{isSelf && <span className="ml-2 text-xs text-gray-400">(vous)</span>}</p>
                    <p className="text-xs text-gray-400">Créé le {new Date(user.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => onResetPassword(user)} disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white/70 hover:bg-white transition disabled:opacity-60">
                        <KeyRound className="w-4 h-4" /> Mot de passe
                    </button>
                    <button onClick={() => onDelete(user)} disabled={busy || isSelf}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-40">
                        <Trash2 className="w-4 h-4" /> Supprimer
                    </button>
                </div>
            </div>
            <PermissionChecks perms={perms} onChange={setPerms} />
            {dirty && (
                <button onClick={() => onSave(user, perms)} disabled={busy}
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm bg-black text-white font-semibold rounded-xl hover:bg-gray-800 active:scale-95 transition disabled:opacity-60">
                    <Save className="w-4 h-4" /> Enregistrer les droits
                </button>
            )}
        </div>
    );
}
