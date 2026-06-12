'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'next-view-transitions';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, AlertTriangle, ShieldAlert, Loader2, ShieldX, Search } from 'lucide-react';
import { useRevealer } from '../../hooks/useRevealer';
import { useProfile } from '../../hooks/useProfile';
import { fetchIncidents, deleteIncident, type IncidentRow } from '../../utils/incidentsRepo';
import IncidentModal from '../../components/IncidentModal';

const SEVERITY_LABELS: Record<number, string> = { 1: 'Léger', 2: 'Moyen', 3: 'Grave' };
const SEVERITY_COLOR: Record<number, string> = {
    1: 'bg-yellow-100 text-yellow-700',
    2: 'bg-orange-100 text-orange-700',
    3: 'bg-red-100 text-red-700',
};

export default function IncidentsPage() {
    useRevealer();
    const { can, loading: profileLoading } = useProfile();

    const [incidents, setIncidents] = useState<IncidentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'blame' | 'incident'>('all');

    const reload = useCallback(async () => {
        setLoading(true);
        setError('');
        try { setIncidents(await fetchIncidents()); }
        catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (!profileLoading && can('view_stats')) void reload();
        else if (!profileLoading) setLoading(false);
    }, [profileLoading, can, reload]);

    const handleDelete = async (inc: IncidentRow) => {
        if (!confirm(`Supprimer cet enregistrement pour ${inc.prenom} ${inc.nom} ?`)) return;
        setBusy(true);
        try { await deleteIncident(inc.id); await reload(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Suppression impossible'); }
        finally { setBusy(false); }
    };

    const filtered = incidents.filter((inc) => {
        if (filterType !== 'all' && inc.type !== filterType) return false;
        if (search) {
            const q = search.toLowerCase();
            return inc.nom.toLowerCase().includes(q) || inc.prenom.toLowerCase().includes(q) || inc.classe.toLowerCase().includes(q);
        }
        return true;
    });

    if (profileLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (!can('view_stats') && !can('create_incident') && !can('blame')) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4 px-6 text-center">
                <ShieldX className="w-12 h-12 text-red-500" />
                <h1 className="text-xl font-bold text-black">Accès refusé</h1>
                <p className="text-gray-600">Vous n&apos;avez pas accès à ce module.</p>
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
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h1 className="text-3xl font-bold text-black tracking-tight flex items-center gap-3">
                            <ShieldAlert className="w-7 h-7 text-orange-500" /> Blâmes &amp; Incidents
                        </h1>
                        {(can('create_incident') || can('blame')) && (
                            <button
                                onClick={() => setCreateOpen(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-95 transition">
                                <Plus className="w-4 h-4" /> Nouveau
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-grow container mx-auto px-6 py-8 max-w-5xl">
                {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                        className="mb-6 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                        {error}
                    </motion.div>
                )}

                {/* Filtres */}
                <div className="flex flex-wrap gap-3 mb-6">
                    <div className="relative flex-grow max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-black/20" />
                    </div>
                    <div className="flex gap-1.5">
                        {(['all', 'incident', 'blame'] as const).map((t) => (
                            <button key={t} onClick={() => setFilterType(t)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                    filterType === t ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                }`}>
                                {t === 'all' ? 'Tous' : t === 'incident' ? 'Incidents' : 'Blâmes'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Compteur */}
                <p className="text-xs text-gray-400 mb-4">{filtered.length} enregistrement{filtered.length > 1 ? 's' : ''}</p>

                {/* Liste */}
                <div className="space-y-3">
                    <AnimatePresence>
                        {filtered.map((inc, i) => (
                            <motion.div
                                key={inc.id}
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                                transition={{ delay: i * 0.03 }}
                                className="backdrop-blur-xl bg-white/70 border border-gray-200/50 rounded-2xl p-4 shadow-sm flex gap-4 items-start"
                            >
                                {/* Icon */}
                                <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                                    inc.type === 'blame' ? 'bg-orange-100' : 'bg-yellow-100'
                                }`}>
                                    {inc.type === 'blame'
                                        ? <ShieldAlert className="w-4 h-4 text-orange-500" />
                                        : <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                    }
                                </div>

                                {/* Content */}
                                <div className="flex-grow min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="font-semibold text-black text-sm">
                                            {inc.prenom} {inc.nom}
                                        </span>
                                        {inc.classe && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">{inc.classe}</span>}
                                        {inc.student_qr && <span className="text-xs text-gray-400">#{inc.student_qr}</span>}
                                        {inc.type === 'blame' && inc.severity && (
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${SEVERITY_COLOR[inc.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                                                {SEVERITY_LABELS[inc.severity]}
                                            </span>
                                        )}
                                    </div>
                                    {inc.description && (
                                        <p className="text-sm text-gray-600 line-clamp-2">{inc.description}</p>
                                    )}
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        {new Date(inc.created_at).toLocaleString('fr-FR')}
                                        {inc.created_by_email && ` · ${inc.created_by_email}`}
                                    </p>
                                </div>

                                {/* Delete */}
                                {can('blame') && (
                                    <button onClick={() => handleDelete(inc)} disabled={busy}
                                        className="flex-shrink-0 p-1.5 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition disabled:opacity-40">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {filtered.length === 0 && !loading && (
                        <p className="text-center text-gray-400 py-12">Aucun enregistrement.</p>
                    )}
                </div>
            </main>

            <IncidentModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={reload}
            />
        </div>
    );
}
