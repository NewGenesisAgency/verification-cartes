'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import { createIncident, type IncidentType } from '../utils/incidentsRepo';
import { useProfile } from '../hooks/useProfile';

export interface IncidentDefaults {
    nom?: string;
    prenom?: string;
    classe?: string;
    qr?: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    defaults?: IncidentDefaults;
    onCreated?: () => void;
}

const SEVERITY_LABELS: Record<number, string> = { 1: 'Léger', 2: 'Moyen', 3: 'Grave' };

export default function IncidentModal({ open, onClose, defaults, onCreated }: Props) {
    const { can } = useProfile();

    const [type, setType] = useState<IncidentType>('incident');
    const [severity, setSeverity] = useState(1);
    const [nom, setNom] = useState(defaults?.nom ?? '');
    const [prenom, setPrenom] = useState(defaults?.prenom ?? '');
    const [classe, setClasse] = useState(defaults?.classe ?? '');
    const [qr, setQr] = useState(defaults?.qr ?? '');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Sync defaults when they change (e.g. after a scan)
    const [lastDefaults, setLastDefaults] = useState<IncidentDefaults | undefined>(undefined);
    if (defaults !== lastDefaults) {
        setLastDefaults(defaults);
        if (defaults?.nom !== undefined) setNom(defaults.nom);
        if (defaults?.prenom !== undefined) setPrenom(defaults.prenom);
        if (defaults?.classe !== undefined) setClasse(defaults.classe);
        if (defaults?.qr !== undefined) setQr(defaults.qr ?? '');
    }

    const canBlame = can('blame');
    const canIncident = can('create_incident');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nom.trim() || !prenom.trim()) { setError('Nom et prénom obligatoires.'); return; }
        if (type === 'blame' && !canBlame) { setError('Permission insuffisante pour un blâme.'); return; }
        if (type === 'incident' && !canIncident) { setError('Permission insuffisante pour un incident.'); return; }
        setBusy(true);
        setError('');
        try {
            await createIncident({
                type,
                severity: type === 'blame' ? severity : undefined,
                student_qr: qr.trim() || undefined,
                nom: nom.trim(),
                prenom: prenom.trim(),
                classe: classe.trim(),
                description: description.trim(),
            });
            setDescription('');
            onClose();
            onCreated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur');
        } finally {
            setBusy(false);
        }
    };

    const handleClose = () => { if (!busy) { setError(''); onClose(); } };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
                >
                    <motion.div
                        initial={{ y: 40, opacity: 0, scale: 0.97 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 20, opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                {type === 'blame'
                                    ? <ShieldAlert className="w-5 h-5 text-orange-500" />
                                    : <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                }
                                <h2 className="font-bold text-black text-base">
                                    {type === 'blame' ? 'Appliquer un blâme' : 'Signaler un incident'}
                                </h2>
                            </div>
                            <button onClick={handleClose} disabled={busy}
                                className="p-1.5 rounded-full hover:bg-gray-100 transition text-gray-500">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                            {/* Type */}
                            <div className="flex gap-2">
                                {canIncident && (
                                    <button type="button"
                                        onClick={() => setType('incident')}
                                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                                            type === 'incident' ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                                        }`}>
                                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Incident
                                    </button>
                                )}
                                {canBlame && (
                                    <button type="button"
                                        onClick={() => setType('blame')}
                                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                                            type === 'blame' ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                                        }`}>
                                        <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />Blâme
                                    </button>
                                )}
                            </div>

                            {/* Severity (blâme only) */}
                            {type === 'blame' && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1.5 font-medium">Sévérité</p>
                                    <div className="flex gap-2">
                                        {[1, 2, 3].map((s) => (
                                            <button key={s} type="button"
                                                onClick={() => setSeverity(s)}
                                                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                                    severity === s
                                                        ? s === 1 ? 'bg-yellow-50 border-yellow-400 text-yellow-700'
                                                            : s === 2 ? 'bg-orange-50 border-orange-400 text-orange-700'
                                                            : 'bg-red-50 border-red-400 text-red-700'
                                                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                                                }`}>
                                                {SEVERITY_LABELS[s]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Student info */}
                            <div className="grid grid-cols-2 gap-2">
                                <input type="text" placeholder="Prénom *" value={prenom} onChange={(e) => setPrenom(e.target.value)} required
                                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 bg-gray-50" />
                                <input type="text" placeholder="Nom *" value={nom} onChange={(e) => setNom(e.target.value)} required
                                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 bg-gray-50" />
                                <input type="text" placeholder="Classe" value={classe} onChange={(e) => setClasse(e.target.value)}
                                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 bg-gray-50" />
                                <input type="text" placeholder="N° carte (QR)" value={qr} onChange={(e) => setQr(e.target.value)}
                                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 bg-gray-50" />
                            </div>

                            {/* Description */}
                            <textarea
                                placeholder="Description (motif, contexte…)"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 bg-gray-50 resize-none"
                            />

                            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={handleClose} disabled={busy}
                                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                                    Annuler
                                </button>
                                <button type="submit" disabled={busy}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 ${
                                        type === 'blame' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-yellow-500 hover:bg-yellow-600'
                                    }`}>
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
