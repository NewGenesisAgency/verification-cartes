'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'next-view-transitions';
import { ArrowLeft, Download, Trash2, Calendar, Clock, User, School, BarChart3, XOctagon, Radio, Filter, FileText, ShieldCheck } from 'lucide-react';
import { useRevealer } from '../../hooks/useRevealer';
import { useProfile } from '../../hooks/useProfile';
import { fetchPassages, deleteAllPassages } from '../../utils/passagesRepo';
import { exportPassagesPdf } from '../../utils/exportPdf';
import { logAudit, fetchAudit, type AuditEntry } from '../../utils/auditRepo';
import { supabase } from '../../utils/supabase';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

interface PassageEntry {
    nom: string;
    prenom: string;
    classe: string;
    date: string;
    heure: string;
    annee: string;
    eligible: string;
    statut: string;
    borne: string;
}

interface PassageStats {
    [key: string]: number; // nombre de passages par étudiant
}

const ACTION_LABELS: Record<string, string> = {
    import_students: 'Import base élèves',
    clear_passages: 'Effacement historique',
};
function labelAction(action: string): string {
    return ACTION_LABELS[action] ?? action;
}

export default function PassagePage() {
    useRevealer();
    const { can } = useProfile();

    const [passages, setPassages] = useState<PassageEntry[]>([]);
    const [currentTime, setCurrentTime] = useState<string>('');
    const [live, setLive] = useState(false);
    const [dateFilter, setDateFilter] = useState<string>('all');   // 'all' | date fr-FR
    const [borneFilter, setBorneFilter] = useState<string>('all'); // 'all' | id de borne
    const [audit, setAudit] = useState<AuditEntry[]>([]);

    useEffect(() => {
        void loadPassages();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mettre à jour l'heure côté client pour éviter l'hydration mismatch
    useEffect(() => {
        // Initialiser l'heure une fois côté client
        setCurrentTime(new Date().toLocaleString('fr-FR'));
        
        // Mettre à jour toutes les secondes
        const interval = setInterval(() => {
            setCurrentTime(new Date().toLocaleString('fr-FR'));
        }, 1000);
        
        return () => clearInterval(interval);
    }, []);

    // Initialiser Lenis smooth scroll
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 1,
            touchMultiplier: 2,
            infinite: false,
        });

        function raf(time: number) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        return () => {
            lenis.destroy();
        };
    }, []);

    const mapEntry = (
        nom: string, prenom: string, classe: string,
        dateStr: string, eligible: string, statut: string, borne: string,
    ): PassageEntry => {
        const dateObj = new Date(dateStr);
        return {
            nom, prenom, classe,
            date: dateObj.toLocaleDateString('fr-FR'),
            heure: dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            annee: dateObj.getFullYear().toString(),
            eligible, statut, borne,
        };
    };

    const loadPassages = useCallback(async () => {
        // 1) Supabase (historique partagé entre bornes)
        const remote = await fetchPassages();
        if (remote) {
            setPassages(remote.map(r =>
                mapEntry(r.nom || '', r.prenom || '', r.classe || '', r.scanned_at, r.eligible ? 'oui' : 'non', r.statut || '', r.borne || '—')));
            return;
        }
        // 2) Repli : historique local
        try {
            const data = JSON.parse(localStorage.getItem('verificationStats') || '[]');
            setPassages(data.map((entry: unknown) => {
                const e = entry as Record<string, unknown>;
                return mapEntry(e.nom as string, e.prenom as string, e.classe as string, e.date as string, e.eligible as string, e.statut as string, '—');
            }));
        } catch {
            // historique illisible : on n'affiche rien
        }
    }, []);

    // Temps réel : un passage sur n'importe quelle borne recharge l'historique.
    useEffect(() => {
        const sb = supabase;
        if (!sb) return;
        const channel = sb
            .channel('passages-live')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'passages' }, () => {
                void loadPassages();
            })
            .subscribe((status) => setLive(status === 'SUBSCRIBED'));
        return () => { void sb.removeChannel(channel); };
    }, [loadPassages]);

    // Options de filtres (calculées sur l'ensemble des passages, pas le filtré).
    const dates = useMemo(
        () => Array.from(new Set(passages.map(p => p.date))).sort((a, b) => b.localeCompare(a)),
        [passages],
    );
    const bornes = useMemo(
        () => Array.from(new Set(passages.map(p => p.borne).filter(b => b && b !== '—'))).sort(),
        [passages],
    );

    // Passages filtrés (par date + par borne) : alimentent cartes, analytics, tableau, export.
    const filtered = useMemo(
        () => passages.filter(p =>
            (dateFilter === 'all' || p.date === dateFilter) &&
            (borneFilter === 'all' || p.borne === borneFilter)),
        [passages, dateFilter, borneFilter],
    );

    // Compte de passages par étudiant (sur le filtré).
    const stats = useMemo<PassageStats>(() => {
        const count: PassageStats = {};
        filtered.forEach(p => {
            const key = `${p.nom}-${p.prenom}`;
            count[key] = (count[key] || 0) + 1;
        });
        return count;
    }, [filtered]);

    // Statistiques agrégées pour le tableau de bord (sur le filtré).
    const analytics = useMemo(() => {
        const total = filtered.length;
        const refused = filtered.filter(p => p.statut === 'Refusé').length;
        const accepted = total - refused;
        const refusalRate = total ? Math.round((refused / total) * 100) : 0;

        const byHour: number[] = new Array(24).fill(0);
        filtered.forEach(p => {
            const h = parseInt(p.heure?.split(':')[0] ?? '');
            if (!isNaN(h)) byHour[h] += 1;
        });
        const maxHour = Math.max(1, ...byHour);

        const byClasse: Record<string, number> = {};
        filtered.forEach(p => { const c = p.classe || '—'; byClasse[c] = (byClasse[c] || 0) + 1; });
        const topClasses = Object.entries(byClasse).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const maxClasse = Math.max(1, ...topClasses.map(c => c[1]));

        return { total, refused, accepted, refusalRate, byHour, maxHour, topClasses, maxClasse };
    }, [filtered]);

    const clearAllPassages = () => {
        if (confirm('Voulez-vous vraiment supprimer tous les passages ?')) {
            localStorage.removeItem('verificationStats');
            void deleteAllPassages();
            void logAudit('clear_passages', { count: passages.length });
            setPassages([]);
        }
    };

    // Journal d'audit (admins uniquement).
    useEffect(() => {
        if (!can('manage_accounts')) return;
        void fetchAudit(30).then(rows => { if (rows) setAudit(rows); });
    }, [can]);

    const exportToCSV = () => {
        // Fonction pour échapper correctement les valeurs CSV
        const escapeCSV = (value: string | number) => {
            const str = String(value);
            // Si contient virgule, guillemets ou retour à la ligne, entourer de guillemets
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const headers = ['Nom', 'Prénom', 'Classe', 'Borne', 'Statut', 'Date', 'Heure', 'Année', 'Nombre de Passage'];
        const rows = filtered.map(p => {
            const key = `${p.nom}-${p.prenom}`;
            return [
                escapeCSV(p.nom),
                escapeCSV(p.prenom),
                escapeCSV(p.classe),
                escapeCSV(p.borne),
                escapeCSV(p.statut),
                escapeCSV(p.date),
                escapeCSV(p.heure),
                escapeCSV(p.annee),
                escapeCSV(stats[key])
            ].join(',');
        });
        
        void exportToCSVImpl(headers, rows);
    };

    const exportPDF = () => {
        exportPassagesPdf({
            passages: filtered,
            analytics,
            dateLabel: dateFilter === 'all' ? 'Toutes les dates' : dateFilter,
            borneLabel: borneFilter === 'all' ? 'Toutes les bornes' : borneFilter,
        });
    };

    const exportToCSVImpl = (headers: string[], rows: string[]) => {
        const csv = [headers.join(','), ...rows].join('\n');
        
        // Ajouter BOM UTF-8 pour que Excel reconnaisse les accents
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `passages-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="backdrop-blur-2xl bg-white/60 border-b border-gray-200/50 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
                <div className="container mx-auto px-6 py-4">
                    <Link 
                        href="/verification-cartes"
                        className="inline-flex items-center text-gray-600 hover:text-black transition-all duration-300 mb-3"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        <span className="text-sm font-medium">Retour</span>
                    </Link>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-black tracking-tight">
                                Historique des Passages
                            </h1>
                            {live && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-700 text-xs font-semibold">
                                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                                    Temps réel
                                </span>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={exportToCSV}
                                className="
                                    group flex items-center gap-2 px-4 py-2
                                    backdrop-blur-2xl bg-white/70 border border-gray-200/50
                                    rounded-2xl
                                    shadow-[0_2px_8px_0_rgba(0,0,0,0.04),inset_0_1px_0_0_rgba(255,255,255,0.9)]
                                    hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,1)]
                                    transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
                                    hover:scale-105 active:scale-95
                                "
                            >
                                <Download className="w-4 h-4 text-gray-600 group-hover:text-black transition-colors" />
                                <span className="text-sm font-semibold text-gray-700 group-hover:text-black">CSV</span>
                            </button>
                            <button
                                onClick={exportPDF}
                                className="
                                    group flex items-center gap-2 px-4 py-2
                                    backdrop-blur-2xl bg-white/70 border border-gray-200/50
                                    rounded-2xl
                                    shadow-[0_2px_8px_0_rgba(0,0,0,0.04),inset_0_1px_0_0_rgba(255,255,255,0.9)]
                                    hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,1)]
                                    transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
                                    hover:scale-105 active:scale-95
                                "
                            >
                                <FileText className="w-4 h-4 text-gray-600 group-hover:text-black transition-colors" />
                                <span className="text-sm font-semibold text-gray-700 group-hover:text-black">PDF</span>
                            </button>
                            {can('clear_history') && (
                                <button
                                    onClick={clearAllPassages}
                                    className="
                                        group flex items-center gap-2 px-4 py-2
                                        backdrop-blur-2xl bg-gradient-to-br from-red-500/90 to-rose-600/90 border border-red-400/30
                                        rounded-2xl
                                        shadow-[0_4px_16px_0_rgba(239,68,68,0.2),inset_0_1px_0_0_rgba(255,255,255,0.3)]
                                        hover:shadow-[0_6px_24px_0_rgba(239,68,68,0.3),inset_0_1px_0_0_rgba(255,255,255,0.4)]
                                        hover:from-red-600 hover:to-rose-700
                                        transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
                                        hover:scale-105 active:scale-95
                                    "
                                >
                                    <Trash2 className="w-4 h-4 text-white transition-colors" />
                                    <span className="text-sm font-semibold text-white">Effacer</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow container mx-auto px-6 py-8 overflow-auto">
                {/* Filtres */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filtres</span>
                    </div>
                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white/80 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-black/20"
                    >
                        <option value="all">Toutes les dates</option>
                        {dates.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select
                        value={borneFilter}
                        onChange={(e) => setBorneFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white/80 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-black/20"
                    >
                        <option value="all">Toutes les bornes</option>
                        {bornes.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    {(dateFilter !== 'all' || borneFilter !== 'all') && (
                        <button
                            onClick={() => { setDateFilter('all'); setBorneFilter('all'); }}
                            className="text-xs text-gray-500 hover:text-black underline"
                        >
                            Réinitialiser
                        </button>
                    )}
                    <span className="ml-auto text-xs text-gray-400">
                        {filtered.length} passage{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
                    </span>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl backdrop-blur-xl">
                                <User className="w-6 h-6 text-gray-700" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Total Passages</p>
                                <p className="text-3xl font-bold text-black">{filtered.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl backdrop-blur-xl">
                                <School className="w-6 h-6 text-gray-700" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Étudiants Uniques</p>
                                <p className="text-3xl font-bold text-black">{Object.keys(stats).length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl backdrop-blur-xl">
                                <Calendar className="w-6 h-6 text-gray-700" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Aujourd&apos;hui</p>
                                <p className="text-3xl font-bold text-black">
                                    {filtered.filter(p => p.date === new Date().toLocaleDateString('fr-FR')).length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl backdrop-blur-xl">
                                <Clock className="w-6 h-6 text-blue-700" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Cette heure</p>
                                <p className="text-3xl font-bold text-black">
                                    {(() => {
                                        const now = new Date();
                                        const currentHour = now.getHours();
                                        const currentDate = now.toLocaleDateString('fr-FR');
                                        return filtered.filter(p => {
                                            if (p.date !== currentDate) return false;
                                            const passageHour = parseInt(p.heure.split(':')[0]);
                                            return passageHour === currentHour;
                                        }).length;
                                    })()}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tableau de bord analytique */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Affluence par heure */}
                    <div className="backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-2 mb-5">
                            <BarChart3 className="w-5 h-5 text-gray-700" />
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Affluence par heure</h3>
                        </div>
                        <div className="flex items-end gap-1 h-40">
                            {analytics.byHour.map((count, h) => (
                                <div key={h} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                                    <span className="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">{count > 0 ? count : ''}</span>
                                    <div
                                        className="w-full bg-gradient-to-t from-gray-800 to-gray-400 rounded-t-md transition-all duration-300"
                                        style={{ height: `${(count / analytics.maxHour) * 100}%`, minHeight: count > 0 ? '4px' : '0' }}
                                        title={`${h}h : ${count} passage(s)`}
                                    />
                                    {h % 3 === 0 && <span className="text-[9px] text-gray-400">{h}h</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Taux de refus + top classes */}
                    <div className="backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-2 mb-4">
                            <XOctagon className="w-5 h-5 text-gray-700" />
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Taux de refus</h3>
                        </div>
                        <div className="flex items-baseline gap-3 mb-2">
                            <span className="text-3xl font-bold text-black">{analytics.refusalRate}%</span>
                            <span className="text-xs text-gray-500">{analytics.refused} refus / {analytics.total} passages</span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden mb-6 flex">
                            <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500" style={{ width: `${100 - analytics.refusalRate}%` }} />
                            <div className="h-full bg-gradient-to-r from-red-400 to-rose-500" style={{ width: `${analytics.refusalRate}%` }} />
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                            <School className="w-4 h-4 text-gray-600" />
                            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Top classes</h4>
                        </div>
                        <div className="space-y-2">
                            {analytics.topClasses.length === 0 ? (
                                <p className="text-sm text-gray-400">Aucune donnée</p>
                            ) : analytics.topClasses.map(([classe, count]) => (
                                <div key={classe} className="flex items-center gap-3">
                                    <span className="text-xs text-gray-600 w-20 truncate" title={classe}>{classe}</span>
                                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-gray-700 to-gray-900 rounded-full" style={{ width: `${(count / analytics.maxClasse) * 100}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-black w-6 text-right">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl overflow-hidden shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200/50 bg-white/30">
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nom</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Prénom</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Classe</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Borne</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Heure</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Année</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Passages</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                                            Aucun passage enregistré
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((passage, index) => {
                                        const key = `${passage.nom}-${passage.prenom}`;
                                        return (
                                            <tr 
                                                key={index}
                                                className="border-b border-gray-200/30 hover:bg-white/40 transition-all duration-200"
                                            >
                                                <td className="px-6 py-4 text-sm font-semibold text-black">{passage.nom}</td>
                                                <td className="px-6 py-4 text-sm text-gray-700">{passage.prenom}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{passage.classe}</td>
                                                <td className="px-6 py-4 text-sm text-gray-500">{passage.borne}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{passage.date}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{passage.heure}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{passage.annee}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center justify-center min-w-[32px] px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-br from-gray-800 to-black text-white shadow-lg">
                                                        {stats[key]}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Journal d'audit — admins uniquement */}
                {can('manage_accounts') && audit.length > 0 && (
                    <div className="mt-8 backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-2 mb-4">
                            <ShieldCheck className="w-5 h-5 text-gray-700" />
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Journal admin</h3>
                        </div>
                        <div className="space-y-2">
                            {audit.map((a, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm border-b border-gray-200/30 pb-2 last:border-0">
                                    <span className="text-xs text-gray-400 w-40 shrink-0">{new Date(a.created_at).toLocaleString('fr-FR')}</span>
                                    <span className="font-semibold text-black w-44 shrink-0">{labelAction(a.action)}</span>
                                    <span className="text-gray-500 truncate flex-1">{a.actor_email ?? '—'}</span>
                                    {typeof a.details?.count === 'number' && (
                                        <span className="text-xs text-gray-400 shrink-0">{a.details.count} élt(s)</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="container mx-auto px-6 py-4 backdrop-blur-xl">
                <div className="text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Mise à jour : {currentTime || 'Chargement...'}</span>
                </div>
            </footer>
        </div>
    );
}
