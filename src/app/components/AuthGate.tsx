'use client';

import { useState } from 'react';
import { Lock, LogIn, Loader2, ShieldCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../utils/supabase';
import { useSession } from '../hooks/useSession';
import { useRevealer } from '../hooks/useRevealer';

/**
 * Protège l'accès aux pages enfants : exige une session agent MDL authentifiée.
 * Si Supabase n'est pas configuré, laisse passer (mode local hors-ligne).
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
    // Déclenche le reveal noir dès le montage du gate (spinner/login/page),
    // sinon l'overlay reste opaque tant que la page protégée n'est pas montée.
    useRevealer();
    const { session, loading } = useSession();

    if (!isSupabaseConfigured) return <>{children}</>;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (!session) return <LoginForm />;

    return <>{children}</>;
}

function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setSubmitting(true);
        setError('');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setError('Identifiants incorrects ou connexion impossible.');
            setSubmitting(false);
        }
        // En cas de succès, onAuthStateChange met à jour la session et affiche l'app.
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 px-6">
            <form
                onSubmit={handleSubmit}
                className="
                    relative w-full max-w-sm
                    backdrop-blur-2xl bg-white/70 border border-white/40
                    rounded-[2rem] p-8
                    shadow-[0_8px_32px_0_rgba(0,0,0,0.10),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                "
            >
                <div className="flex flex-col items-center gap-3 mb-6">
                    <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg">
                        <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-xl font-bold text-black">Espace agent MDL</h1>
                        <p className="text-sm text-gray-500 mt-1">Connexion requise pour la vérification</p>
                    </div>
                </div>

                <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full mb-4 px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                    placeholder="agent@mdl.lycee"
                />

                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Mot de passe
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full mb-5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                    placeholder="••••••••"
                />

                {error && <p className="text-sm text-red-600 mb-4 text-center">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="
                        w-full flex items-center justify-center gap-2 px-4 py-3
                        bg-black text-white font-semibold rounded-xl
                        transition-all duration-300 hover:bg-gray-800
                        active:scale-95 disabled:opacity-60
                    "
                >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                    {submitting ? 'Connexion...' : 'Se connecter'}
                </button>
            </form>
        </div>
    );
}
