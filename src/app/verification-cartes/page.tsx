'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'next-view-transitions';
import { ArrowLeft, Check, X, Camera as CameraIcon, BarChart3, Search, Sparkles, ScanLine, Upload, Download, Users, Loader2, XCircle, CameraOff, AlertTriangle, LogOut, Maximize, Minimize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRevealer } from '../hooks/useRevealer';
import { useProfile } from '../hooks/useProfile';
import * as XLSX from 'xlsx';
import jsQR from 'jsqr';
import { isValidHumanName } from '../utils/nameValidator';
import { detectWithMultipleWords } from '../utils/detectionHelper';
import { preloadOCR, terminateOCR } from '../utils/ocrWorker';
import { ocrRecognize, preloadOcrEngine, OCR_ENGINE, recognizeOllama, warmOllama } from '../utils/ocrEngine';
import { computeCenteredROI, sampleROI, frameDiff, cropROI } from '../utils/imageProcessing';
import { prepareForOcr, type DetectedBox } from '../utils/textPipeline';
import { debugLog } from '../utils/debug';
import { fetchStudents, replaceAllStudents } from '../utils/studentsRepo';
import { recordPassage, flushPassageQueue } from '../utils/passagesRepo';
import { decodePDF417 } from '../utils/pdf417';
import { logAudit } from '../utils/auditRepo';

type VerificationStatus = 'idle' | 'processing' | 'success' | 'error' | 'screenshot';

interface Student {
    nom: string;
    prenom: string;
    classe: string;
    eligible?: string;
    numero?: string;
}

// Cooldowns anti-rescan
const SUCCESS_COOLDOWN_MS = 60_000;     // 1 min après une carte acceptée
const ERROR_COOLDOWN_MS = 300_000;      // 5 min après un refus
const RESULT_DISPLAY_MS = 3_000;        // durée d'affichage du verdict
const QR_SCAN_INTERVAL_MS = 200;        // QR : rapide, jamais bloqué par l'OCR
const OCR_SCAN_INTERVAL_MS = 700;       // OCR : plus lourd, sérialisé

// Détection de présence / stabilité de la carte (constantes ajustables)
const MIN_DETAIL_VARIANCE = 60;         // en-dessous : ROI vide/uniforme → pas d'OCR
const STABILITY_THRESHOLD = 0.10;       // au-dessus : la carte bouge encore → on attend
// Confirmation multi-frames
const HIGH_CONFIDENCE = 0.95;           // ≥ → validation immédiate (1 lecture)
const CANDIDATE_TTL_MS = 3_000;         // un candidat OCR non confirmé expire après 3 s

function normalizeAccents(str: string): string {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function cardIdOf(student: { nom: string; prenom: string }): string {
    return normalizeAccents(`${student.nom}-${student.prenom}`);
}

// Durée d'affichage de l'overlay des zones détectées (ms).
const OVERLAY_TTL_MS = 1200;

function strokeRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.stroke();
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Zone du nom/prénom calculée à partir de la position du QR code.
 * Sur le Pass Région, le nom est juste SOUS le QR et décalé à GAUCHE.
 */
function nameRoiFromQr(box: { x: number; y: number; w: number; h: number }, W: number, H: number) {
    const qrBottom = box.y + box.h;
    // Large horizontalement (les noms composés s'étendent jusque sous le QR),
    // ciblé en hauteur sur les lignes prénom + NOM (au-dessus de l'établissement).
    const x0 = clamp(box.x - 1.3 * box.w, 0, W);
    const x1 = clamp(box.x + 1.1 * box.w, 0, W);
    const y0 = clamp(qrBottom + 0.08 * box.h, 0, H);
    const y1 = clamp(qrBottom + 0.66 * box.h, 0, H);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Garde uniquement la portion prénom + NOM : coupe dès la ligne établissement
 * (LYCEE/LPO/LGT/…) ou « N° dossier / N° carte ». Repli = texte complet.
 */
function namePortion(text: string): string {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const kept: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = norm(raw.trim());
        if (!line) continue;
        // Préfixe d'établissement (tolérant aux fautes OCR sur la suite du mot)
        const isSchool = /^(LYC|LPO|LGT|COL|CFA|ERE|SEP|ECO|LP\b|INSTITUT)/.test(line);
        // Ligne « N° dossier / N° carte » : marqueur N° ou présence de chiffres
        const isNumber = /N\s*[°ºo0]/.test(line) || /DOSSIER|CARTE/.test(line) || line.replace(/\D/g, '').length >= 4;
        // Boilerplate (colonne gauche / bas de carte)
        const isBoiler = /^(VOTRE|JEUNES|TELECHARGEZ|REJOIGNEZ|AUVERGNE|REGION|PASS)/.test(line);
        if (isSchool || isNumber || isBoiler) break; // tout ce qui suit n'est plus le nom
        kept.push(raw);
    }
    const joined = kept.join(' ').trim();
    return joined.length > 0 ? joined : text;
}

export default function VerificationCartesPage() {
    useRevealer();
    const { can, email, signOut } = useProfile();

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');
    const [studentInfo, setStudentInfo] = useState<Student | null>(null);
    const [message, setMessage] = useState('');
    const [isEligible, setIsEligible] = useState(false);
    const [confidence, setConfidence] = useState(0);
    const [databaseStudents, setDatabaseStudents] = useState<Student[]>([]);
    const [isScreenshotExiting, setIsScreenshotExiting] = useState(false);
    const [hasCustomDB, setHasCustomDB] = useState(false);
    const [cameraError, setCameraError] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [vlmAnalyzing, setVlmAnalyzing] = useState(false);
    const [autoVlm, setAutoVlm] = useState(false);

    const streamRef = useRef<MediaStream | null>(null);
    const ocrIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const isProcessingRef = useRef(false);
    const statusRef = useRef<VerificationStatus>('idle');
    const validSoundRef = useRef<HTMLAudioElement | null>(null);
    const errorSoundRef = useRef<HTMLAudioElement | null>(null);
    const lastScannedCardsRef = useRef<Map<string, { timestamp: number; eligible: boolean; isValid: boolean }>>(new Map());
    const lastCardIdRef = useRef<string | null>(null);
    const lastOCRCardRef = useRef<{ cardId: string; timestamp: number } | null>(null);
    const lastQRCodeRef = useRef<{ qrData: string; timestamp: number } | null>(null);
    const lastErrorQRRef = useRef<string | null>(null);
    const pdf417TickRef = useRef(0);
    const ocrBoxesRef = useRef<{ boxes: DetectedBox[]; ts: number }>({ boxes: [], ts: 0 });
    const qrAnchorRef = useRef<{ box: { x: number; y: number; w: number; h: number }; ts: number } | null>(null);
    const autoVlmRef = useRef(false);
    const autoVlmFiredRef = useRef(false);
    const analyzeVlmRef = useRef<() => void>(() => {});
    const prevSampleRef = useRef<Uint8ClampedArray | null>(null);
    const ocrCandidateRef = useRef<{ cardId: string; count: number; ts: number } | null>(null);

    // Garde le statut courant accessible dans les boucles sans les recréer.
    useEffect(() => { statusRef.current = verificationStatus; }, [verificationStatus]);

    // Pré-charge le worker OCR pour que le premier scan soit instantané.
    useEffect(() => {
        preloadOCR();
        preloadOcrEngine();
        void warmOllama(); // précharge le VLM (best-effort) pour le bouton « Analyse IA »
        return () => { void terminateOCR(); };
    }, []);

    // Rejoue les passages enregistrés hors-ligne dès qu'on est connecté.
    useEffect(() => { void flushPassageQueue(); }, []);

    useEffect(() => {
        validSoundRef.current = new Audio('/data/sounds/valid.mp3');
        errorSoundRef.current = new Audio('/data/sounds/error.mp3');
    }, []);

    // ---- Chargement de la base de données --------------------------------
    const parseStudents = useCallback((rawData: unknown[]): Student[] => {
        return rawData.map((row: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rowData = row as Record<string, any>;

            const nom = String(rowData.nom || rowData.Nom || rowData.NOM || rowData.name || rowData.Name || '');
            const prenom = String(rowData.prenom || rowData.Prénom || rowData.Prenom || rowData.PRENOM || rowData.firstname || rowData.FirstName || '');
            const classe = String(rowData.classe || rowData.Classe || rowData.CLASSE || rowData.class || rowData.Class || '');

            let numeroRaw = rowData.numero || rowData.Numero || rowData.NUMERO || rowData.Numéro || rowData.number || rowData.Number || rowData.code || rowData.Code || '';
            if (!numeroRaw) {
                for (const key of Object.keys(rowData)) {
                    if (key.includes('EMPTY') || key.includes('empty') || (!isNaN(Number(key)) && Number(key) >= 3)) {
                        const val = rowData[key];
                        if (val && /^\d+$/.test(String(val))) {
                            numeroRaw = val;
                            break;
                        }
                    }
                }
            }
            const numero = numeroRaw ? String(numeroRaw).trim() : '';
            const eligible = rowData.eligible || rowData.Eligible || rowData.ELIGIBLE ||
                rowData.éligible || rowData.Éligible || rowData['Éligible'] ||
                rowData.mdl || rowData.MDL || rowData.Mdl ||
                rowData.valide || rowData.Valide || rowData.VALIDE ||
                'oui';

            return { nom, prenom, classe, eligible, numero };
        });
    }, []);

    useEffect(() => {
        const loadDatabase = async () => {
            try {
                // 1) Source de vérité : Supabase (si configuré + agent connecté)
                const remote = await fetchStudents();
                if (remote && remote.length > 0) {
                    debugLog(`Base chargée depuis Supabase : ${remote.length} étudiants`);
                    setDatabaseStudents(remote);
                    return;
                }
                // 2) Repli : base personnalisée locale
                const localDB = localStorage.getItem('mdl_database');
                const isCustom = localStorage.getItem('mdl_has_custom_db') === 'true';
                if (localDB && isCustom) {
                    setDatabaseStudents(JSON.parse(localDB));
                    return;
                }
                // 3) Repli : fichier Excel par défaut
                const response = await fetch('/data/database.xlsx');
                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = parseStudents(XLSX.utils.sheet_to_json(worksheet));
                debugLog(`Base chargée : ${data.length} étudiants`);
                setDatabaseStudents(data);
            } catch (error) {
                console.error('Erreur chargement base de données:', error);
            }
        };
        loadDatabase();
    }, [parseStudents]);

    // ---- Helpers ----------------------------------------------------------
    const canScanCard = useCallback((cardId: string): { canScan: boolean; reason?: string } => {
        const now = Date.now();
        const history = lastScannedCardsRef.current.get(cardId);
        if (!history || !history.isValid) return { canScan: true };

        const elapsed = now - history.timestamp;
        if (history.eligible) {
            if (elapsed < SUCCESS_COOLDOWN_MS) {
                const s = Math.ceil((SUCCESS_COOLDOWN_MS - elapsed) / 1000);
                return { canScan: false, reason: `Attendez ${s}s avant de rescanner` };
            }
        } else if (elapsed < ERROR_COOLDOWN_MS) {
            const min = Math.ceil((ERROR_COOLDOWN_MS - elapsed) / 60000);
            const sec = Math.ceil((ERROR_COOLDOWN_MS - elapsed) / 1000) % 60;
            return { canScan: false, reason: min > 0 ? `Attendez ${min}min ${sec}s avant de rescanner` : `Attendez ${sec}s avant de rescanner` };
        }
        return { canScan: true };
    }, []);

    const registerScan = useCallback((cardId: string, eligible: boolean) => {
        lastScannedCardsRef.current.set(cardId, { timestamp: Date.now(), eligible, isValid: true });
        lastCardIdRef.current = cardId;
    }, []);

    const saveToStats = useCallback((student: Student, eligible: boolean, source: 'qr' | 'ocr' | 'manual') => {
        // a) Historique local (compatibilité + cache offline)
        try {
            const stats = JSON.parse(localStorage.getItem('verificationStats') || '[]');
            stats.push({
                date: new Date().toISOString(),
                nom: student.nom,
                prenom: student.prenom,
                classe: student.classe,
                eligible: student.eligible,
                statut: eligible ? 'Accepté' : 'Refusé',
            });
            localStorage.setItem('verificationStats', JSON.stringify(stats));
        } catch (error) {
            console.error('Erreur sauvegarde stats:', error);
        }
        // b) Supabase (fire-and-forget ; file offline gérée par le repo)
        void recordPassage({
            nom: student.nom,
            prenom: student.prenom,
            classe: student.classe,
            eligible,
            statut: eligible ? 'Accepté' : 'Refusé',
            source,
        });
    }, []);

    const showResult = useCallback((opts: {
        student: Student | null;
        eligible: boolean;
        confidence?: number;
        message: string;
        status: 'success' | 'error';
        playValid?: boolean;
        playError?: boolean;
    }) => {
        setStudentInfo(opts.student);
        setIsEligible(opts.eligible);
        setConfidence(opts.confidence ?? 0);
        setMessage(opts.message);
        setVerificationStatus(opts.status);
        if (opts.playValid) validSoundRef.current?.play().catch(() => {});
        if (opts.playError) errorSoundRef.current?.play().catch(() => {});

        setTimeout(() => {
            setVerificationStatus('idle');
            setStudentInfo(null);
            setMessage('');
            setConfidence(0);
        }, RESULT_DISPLAY_MS);
    }, []);

    const extractValidNames = useCallback(async (text: string): Promise<string[]> => {
        const cleanText = text.toUpperCase().replace(/[^A-ZÀ-ÿ\s]/g, ' ');
        const allWords = cleanText.split(/\s+/).filter(w => w.length > 0);
        const results = await Promise.all(
            allWords.map(async (word) => ({ word, isValid: await isValidHumanName(word) })),
        );
        return results.filter(r => r.isValid).map(r => r.word);
    }, []);

    // ---- Caméra -----------------------------------------------------------
    const startCamera = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: 1280, height: 720 },
            });
            streamRef.current = mediaStream;
            setStream(mediaStream);
            if (videoRef.current) videoRef.current.srcObject = mediaStream;
            setCameraError(false);
        } catch {
            setCameraError(true);
        }
    }, []);

    const drawVideoToCanvas = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
            animationFrameRef.current = requestAnimationFrame(drawVideoToCanvas);
            return;
        }
        const context = canvas.getContext('2d');
        if (!context) return;
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            animationFrameRef.current = requestAnimationFrame(drawVideoToCanvas);
            return;
        }
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
        context.drawImage(video, 0, 0);

        // Overlay : zones de texte détectées par le pipeline (feedback + réglage).
        const det = ocrBoxesRef.current;
        const age = Date.now() - det.ts;
        if (det.boxes.length > 0 && age < OVERLAY_TTL_MS) {
            const alpha = Math.max(0, 1 - age / OVERLAY_TTL_MS);
            context.save();
            context.strokeStyle = `rgba(16,185,129,${0.9 * alpha})`;
            context.lineWidth = Math.max(2, canvas.width * 0.0035);
            context.shadowColor = `rgba(16,185,129,${0.6 * alpha})`;
            context.shadowBlur = 14;
            for (const b of det.boxes) {
                strokeRoundedRect(context, b.x, b.y, b.w, b.h, Math.min(14, b.h * 0.25));
            }
            context.restore();
        }

        animationFrameRef.current = requestAnimationFrame(drawVideoToCanvas);
    }, []);

    // ---- Boucle QR (rapide, jamais bloquée par l'OCR) ---------------------
    const scanQR = useCallback(async () => {
        const status = statusRef.current;
        if (status === 'success' || status === 'screenshot') return;

        const video = videoRef.current;
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
        if (databaseStudents.length === 0) return;

        const tmp = document.createElement('canvas');
        tmp.width = video.videoWidth;
        tmp.height = video.videoHeight;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, tmp.width, tmp.height);

        // Détection du code : QR d'abord, puis PDF417 (dos de carte) en repli throttlé.
        let code: string | null = null;
        const qr = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (qr && qr.data) {
            code = qr.data.trim();
            // Mémorise la position du QR → sert à cibler la zone du nom pour l'OCR.
            const L = qr.location;
            if (L) {
                const xs = [L.topLeftCorner.x, L.topRightCorner.x, L.bottomLeftCorner.x, L.bottomRightCorner.x];
                const ys = [L.topLeftCorner.y, L.topRightCorner.y, L.bottomLeftCorner.y, L.bottomRightCorner.y];
                const qx = Math.min(...xs), qy = Math.min(...ys);
                qrAnchorRef.current = { box: { x: qx, y: qy, w: Math.max(...xs) - qx, h: Math.max(...ys) - qy }, ts: Date.now() };
            }
        } else {
            pdf417TickRef.current = (pdf417TickRef.current + 1) % 3;
            if (pdf417TickRef.current === 0) code = decodePDF417(imageData);
        }
        if (!code) return;

        const now = Date.now();
        if (lastQRCodeRef.current?.qrData === code && now - lastQRCodeRef.current.timestamp < 3000) return;
        lastQRCodeRef.current = { qrData: code, timestamp: now };

        // 1) Recherche par numéro (Passe Région) — instantané et fiable
        let found = databaseStudents.find(s => s.numero && s.numero === code);
        let conf = 1;

        // 1bis) Comparaison par chiffres seuls (QR avec espaces, ou URL contenant le n°)
        if (!found) {
            const codeDigits = code.replace(/\D/g, '');
            if (codeDigits.length >= 6) {
                found = databaseStudents.find(s => s.numero && s.numero.replace(/\D/g, '') === codeDigits);
            }
        }

        // 2) Sinon, le code contient peut-être un nom/prénom
        if (!found) {
            const words = code.toUpperCase().split(/[\s-]+/).filter(w => w.length > 2);
            if (words.length > 0) {
                const res = await detectWithMultipleWords(words, databaseStudents);
                if (res.student && res.isValidMatch) {
                    found = res.student;
                    conf = res.confidence;
                }
            }
        }

        if (found) {
            const eligible = found.eligible?.toLowerCase() === 'oui';
            const cardId = cardIdOf(found);
            if (!canScanCard(cardId).canScan) return;
            registerScan(cardId, eligible);
            saveToStats(found, eligible, 'qr');
            showResult({
                student: found,
                eligible,
                confidence: conf,
                message: eligible ? 'Accès autorisé !' : 'Accès refusé',
                status: 'success',
                playValid: eligible,
                playError: !eligible,
            });
        } else {
            const isNewError = lastErrorQRRef.current !== code;
            lastErrorQRRef.current = code;
            showResult({
                student: { nom: '', prenom: 'Carte inconnue', classe: 'Non répertoriée', eligible: 'non' },
                eligible: false,
                message: 'Code introuvable dans la base',
                status: 'error',
                playError: isNewError,
            });
        }
    }, [databaseStudents, canScanCard, registerScan, saveToStats, showResult]);

    // ---- Analyse approfondie (screenshot HD) ------------------------------
    const dismissScreenshot = useCallback(() => {
        setIsScreenshotExiting(true);
        setTimeout(() => {
            setVerificationStatus('idle');
            setMessage('');
            setIsScreenshotExiting(false);
        }, 500);
    }, []);

    const deepScan = useCallback(async (words: string[], foundWord: string) => {
        const video = videoRef.current;
        if (!video) return;

        setVerificationStatus('screenshot');
        setIsScreenshotExiting(false);
        setMessage(`"${foundWord}" détecté, recherche du reste...`);

        const anchor = qrAnchorRef.current;
        let roi = (anchor && Date.now() - anchor.ts < 2500)
            ? nameRoiFromQr(anchor.box, video.videoWidth, video.videoHeight)
            : computeCenteredROI(video.videoWidth, video.videoHeight, 0.8);
        if (roi.width < 40 || roi.height < 24) roi = computeCenteredROI(video.videoWidth, video.videoHeight, 0.8);
        const { canvas: prepared, boxes } = prepareForOcr(video, roi, 3);
        ocrBoxesRef.current = { boxes, ts: Date.now() };
        const text2 = await ocrRecognize(OCR_ENGINE === 'ollama' ? cropROI(video, roi) : prepared);
        const words2 = await extractValidNames(namePortion(text2));
        const allWords = [...new Set([...words, ...words2])];
        const res = await detectWithMultipleWords(allWords, databaseStudents);

        if (res.student && res.isValidMatch) {
            const student = res.student;
            const eligible = student.eligible?.toLowerCase() === 'oui';
            const cardId = cardIdOf(student);
            const now = Date.now();
            if (lastOCRCardRef.current?.cardId === cardId && now - lastOCRCardRef.current.timestamp < 5000) {
                dismissScreenshot();
                return;
            }
            lastOCRCardRef.current = { cardId, timestamp: now };
            if (!canScanCard(cardId).canScan) {
                dismissScreenshot();
                return;
            }
            registerScan(cardId, eligible);
            saveToStats(student, eligible, 'ocr');

            setTimeout(() => {
                setIsScreenshotExiting(true);
                setTimeout(() => {
                    showResult({
                        student,
                        eligible,
                        confidence: res.confidence,
                        message: eligible ? 'Accès autorisé !' : 'Accès refusé',
                        status: 'success',
                        playValid: eligible,
                        playError: !eligible,
                    });
                }, 500);
            }, 1000);
        } else {
            setTimeout(() => dismissScreenshot(), 1000);
        }
    }, [databaseStudents, canScanCard, registerScan, saveToStats, showResult, extractValidNames, dismissScreenshot]);

    // ---- Boucle OCR (noms/prénoms) ----------------------------------------
    const scanOCR = useCallback(async () => {
        if (isProcessingRef.current) return;
        const status = statusRef.current;
        if (status === 'processing' || status === 'success' || status === 'screenshot') return;

        const video = videoRef.current;
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
        if (databaseStudents.length === 0) return;

        isProcessingRef.current = true;
        try {
            // Zone du nom : ancrée sur le QR si vu récemment, sinon centrée.
            const anchor = qrAnchorRef.current;
            let roi = (anchor && Date.now() - anchor.ts < 2500)
                ? nameRoiFromQr(anchor.box, video.videoWidth, video.videoHeight)
                : computeCenteredROI(video.videoWidth, video.videoHeight, 0.7);
            if (roi.width < 40 || roi.height < 24) roi = computeCenteredROI(video.videoWidth, video.videoHeight, 0.7);

            // Présence + stabilité : on ne lance l'OCR (coûteux) que si une carte
            // est cadrée ET immobile → moins de CPU, pas de flou de mouvement.
            const sample = sampleROI(video, roi, 32);
            const prev = prevSampleRef.current;
            prevSampleRef.current = sample.signature;
            if (sample.variance < MIN_DETAIL_VARIANCE) { autoVlmFiredRef.current = false; return; } // pas de carte → réarme l'auto
            if (prev && frameDiff(prev, sample.signature) > STABILITY_THRESHOLD) return; // bouge encore

            // Mode Auto IA : carte stable → déclenche le VLM une fois (puis on saute l'OCR Tesseract).
            if (autoVlmRef.current) {
                if (!autoVlmFiredRef.current) { autoVlmFiredRef.current = true; analyzeVlmRef.current(); }
                return;
            }

            const { canvas: prepared, boxes } = prepareForOcr(video, roi, 3);
            ocrBoxesRef.current = { boxes, ts: Date.now() };
            // VLM (Ollama) : image couleur naturelle ; OCR classique : binaire du pipeline.
            const text = await ocrRecognize(OCR_ENGINE === 'ollama' ? cropROI(video, roi) : prepared);
            if (!text || text.trim().length === 0) return;

            const words = await extractValidNames(namePortion(text));
            if (words.length === 0) return;

            const result = await detectWithMultipleWords(words, databaseStudents);

            // Cas 1 : correspondance complète
            if (result.student && result.isValidMatch) {
                const student = result.student;
                const cardId = cardIdOf(student);
                const now = Date.now();

                // Confirmation multi-frames : une correspondance approximative doit
                // être vue 2 fois de suite ; une quasi exacte (≥ HIGH_CONFIDENCE) passe direct.
                const needed = result.confidence >= HIGH_CONFIDENCE ? 1 : 2;
                const cand = ocrCandidateRef.current;
                if (cand && cand.cardId === cardId && now - cand.ts < CANDIDATE_TTL_MS) {
                    cand.count += 1;
                    cand.ts = now;
                } else {
                    ocrCandidateRef.current = { cardId, count: 1, ts: now };
                }
                if (ocrCandidateRef.current!.count < needed) return; // pas encore confirmé
                ocrCandidateRef.current = null;

                if (lastOCRCardRef.current?.cardId === cardId && now - lastOCRCardRef.current.timestamp < 5000) return;
                lastOCRCardRef.current = { cardId, timestamp: now };
                if (!canScanCard(cardId).canScan) return;

                const eligible = student.eligible?.toLowerCase() === 'oui';
                registerScan(cardId, eligible);
                saveToStats(student, eligible, 'ocr');
                showResult({
                    student,
                    eligible,
                    confidence: result.confidence,
                    message: eligible ? 'Accès autorisé !' : 'Accès refusé',
                    status: 'success',
                    playValid: eligible,
                    playError: !eligible,
                });
                return;
            }

            // Aucune correspondance complète → on oublie le candidat en cours.
            ocrCandidateRef.current = null;

            // Cas 2 : un seul nom trouvé → analyse approfondie
            if (result.needsScreenshot && result.partialMatch) {
                await deepScan(words, result.partialMatch.foundWord);
                return;
            }

            // Cas 3 : identité non reconnue
            if (words.length >= 2) {
                const cardId = normalizeAccents(`${words[words.length - 1]}-${words[0]}`);
                const now = Date.now();
                if (lastOCRCardRef.current?.cardId === cardId && now - lastOCRCardRef.current.timestamp < 5000) return;
                lastOCRCardRef.current = { cardId, timestamp: now };
                if (!canScanCard(cardId).canScan) return;

                registerScan(cardId, false);
                showResult({
                    student: { nom: words[words.length - 1] || '', prenom: words[0] || '', classe: 'Identité non reconnue', eligible: 'non' },
                    eligible: false,
                    message: 'Accès refusé - Identité non reconnue',
                    status: 'error',
                });
            }
        } catch (error) {
            console.error('Erreur OCR:', error);
        } finally {
            isProcessingRef.current = false;
        }
    }, [databaseStudents, canScanCard, registerScan, saveToStats, showResult, extractValidNames, deepScan]);

    // ---- Cycle de vie caméra + boucles ------------------------------------
    useEffect(() => {
        startCamera();
        return () => {
            streamRef.current?.getTracks().forEach(track => track.stop());
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current);
            if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !stream) return;
        const handleLoadedMetadata = () => {
            animationFrameRef.current = requestAnimationFrame(drawVideoToCanvas);
        };
        if (video.readyState >= 2) {
            animationFrameRef.current = requestAnimationFrame(drawVideoToCanvas);
        } else {
            video.addEventListener('loadedmetadata', handleLoadedMetadata);
        }
        return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }, [stream, drawVideoToCanvas]);

    // Boucle QR rapide
    useEffect(() => {
        if (!stream || databaseStudents.length === 0) return;
        qrIntervalRef.current = setInterval(scanQR, QR_SCAN_INTERVAL_MS);
        return () => { if (qrIntervalRef.current) clearInterval(qrIntervalRef.current); };
    }, [stream, databaseStudents.length, scanQR]);

    // Boucle OCR
    useEffect(() => {
        if (!stream || databaseStudents.length === 0) return;
        ocrIntervalRef.current = setInterval(scanOCR, OCR_SCAN_INTERVAL_MS);
        return () => { if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current); };
    }, [stream, databaseStudents.length, scanOCR]);

    // ---- Import / export base ---------------------------------------------
    const handleUploadDatabase = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const workbook = XLSX.read(e.target?.result);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

                // Garde-fou éligibilité : détecter si une colonne d'éligibilité existe.
                const eligibleKeys = ['eligible', 'éligible', 'mdl', 'valide'];
                const hasEligibleCol = rawData.length > 0 && Object.keys(rawData[0]).some(
                    k => eligibleKeys.includes(k.trim().toLowerCase()),
                );

                const students = parseStudents(rawData);
                localStorage.setItem('mdl_database', JSON.stringify(students));
                localStorage.setItem('mdl_has_custom_db', 'true');
                setDatabaseStudents(students);
                setHasCustomDB(true);
                // Synchronisation vers Supabase (source de vérité partagée entre bornes)
                const synced = await replaceAllStudents(students);
                if (synced) void logAudit('import_students', { count: students.length, hasEligibleColumn: hasEligibleCol });
                alert(
                    `✅ Base de données importée!\n${students.length} étudiants chargés` +
                    (synced ? '\n☁️ Synchronisée sur Supabase' : '\n⚠️ Non synchronisée (hors-ligne) — resync au prochain import') +
                    (hasEligibleCol ? '' : '\n⚠️ Aucune colonne d\'éligibilité détectée : TOUS les élèves sont marqués éligibles. Ajoutez une colonne "eligible" (oui/non).'),
                );
            } catch (error) {
                console.error('Erreur upload:', error);
                alert('❌ Erreur lors du chargement du fichier');
            }
        };
        reader.readAsArrayBuffer(file);
    }, [parseStudents]);

    const handleDownloadDatabase = useCallback(() => {
        if (databaseStudents.length === 0) {
            alert('❌ Aucune base de données à télécharger');
            return;
        }
        const ws = XLSX.utils.json_to_sheet(databaseStudents);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Etudiants');
        XLSX.writeFile(wb, 'database.xlsx');
    }, [databaseStudents]);

    const handleUseDefaultDatabase = useCallback(async () => {
        localStorage.removeItem('mdl_database');
        localStorage.removeItem('mdl_has_custom_db');
        window.location.reload();
    }, []);

    useEffect(() => {
        setHasCustomDB(localStorage.getItem('mdl_has_custom_db') === 'true');
    }, []);

    // ---- Recherche manuelle dans la base ----------------------------------
    const searchResults = useMemo(() => {
        const q = normalizeAccents(searchQuery.trim());
        if (q.length < 1) return [];
        const tokens = q.split(/\s+/).filter(Boolean);
        return databaseStudents.filter(s => {
            const hay = normalizeAccents(`${s.nom} ${s.prenom} ${s.classe}`);
            return tokens.every(t => hay.includes(t));
        }).slice(0, 60);
    }, [searchQuery, databaseStudents]);

    const validateManual = useCallback((student: Student) => {
        const eligible = student.eligible?.toLowerCase() === 'oui';
        saveToStats(student, eligible, 'manual');
        setSearchOpen(false);
        setSearchQuery('');
        showResult({
            student,
            eligible,
            message: eligible ? 'Accès autorisé (manuel)' : 'Accès refusé (manuel)',
            status: 'success',
            playValid: eligible,
            playError: !eligible,
        });
    }, [saveToStats, showResult]);

    // ---- Analyse IA à la demande (VLM Ollama gemma3:4b) -------------------
    const analyzeWithVLM = useCallback(async () => {
        if (vlmAnalyzing) return;
        const video = videoRef.current;
        if (!video || video.videoWidth === 0 || databaseStudents.length === 0) return;

        setVlmAnalyzing(true);
        try {
            const anchor = qrAnchorRef.current;
            const roi = (anchor && Date.now() - anchor.ts < 4000)
                ? nameRoiFromQr(anchor.box, video.videoWidth, video.videoHeight)
                : computeCenteredROI(video.videoWidth, video.videoHeight, 0.8);
            const crop = cropROI(video, roi);
            const text = await recognizeOllama(crop);
            const words = await extractValidNames(namePortion(text));
            const result = await detectWithMultipleWords(words, databaseStudents);

            if (result.student && result.isValidMatch) {
                const student = result.student;
                const eligible = student.eligible?.toLowerCase() === 'oui';
                saveToStats(student, eligible, 'ocr');
                showResult({
                    student, eligible, confidence: result.confidence,
                    message: eligible ? 'Accès autorisé !' : 'Accès refusé',
                    status: 'success', playValid: eligible, playError: !eligible,
                });
            } else {
                showResult({
                    student: { nom: text.trim().slice(0, 40), prenom: 'Analyse IA', classe: 'Identité non reconnue', eligible: 'non' },
                    eligible: false, message: 'Aucune correspondance en base', status: 'error',
                });
            }
        } catch {
            showResult({
                student: { nom: '', prenom: 'Analyse IA', classe: 'Service indisponible', eligible: 'non' },
                eligible: false, message: 'IA indisponible (Ollama éteint ?)', status: 'error',
            });
        } finally {
            setVlmAnalyzing(false);
        }
    }, [vlmAnalyzing, databaseStudents, extractValidNames, saveToStats, showResult]);

    // Raccourci clavier : touche A déclenche l'analyse IA.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'a' || e.key === 'A' || e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                void analyzeWithVLM();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [analyzeWithVLM]);

    // Garde des refs à jour pour le déclenchement auto depuis la boucle de scan.
    useEffect(() => { autoVlmRef.current = autoVlm; }, [autoVlm]);
    useEffect(() => { analyzeVlmRef.current = () => { void analyzeWithVLM(); }; }, [analyzeWithVLM]);

    // Plein écran (mode kiosque)
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    }, []);

    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    return (
        <div className="min-h-screen bg-white flex flex-col overflow-hidden">
            {/* Header */}
            <header className="border-b border-gray-200">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Link
                                href="/"
                                className="inline-flex items-center text-black hover:text-gray-600 transition-colors mb-2"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                <span className="text-sm">Retour</span>
                            </Link>
                            <h1 className="text-xl font-bold text-black">
                                Vérification des Cartes
                            </h1>
                            <div className="flex items-center gap-2 mt-1">
                                {databaseStudents.length > 0 ? (
                                    <>
                                        <Users className="w-4 h-4 text-green-600" />
                                        <p className="text-xs text-gray-700 font-medium">
                                            {databaseStudents.length} étudiant{databaseStudents.length > 1 ? 's' : ''} chargé{databaseStudents.length > 1 ? 's' : ''}
                                        </p>
                                        {hasCustomDB && (
                                            <button
                                                onClick={handleUseDefaultDatabase}
                                                className="ml-1 text-xs text-gray-400 hover:text-red-600 transition-colors flex items-center gap-1 group"
                                                title="Revenir à la base par défaut"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">Base personnalisée</span>
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                                        <p className="text-xs text-gray-500">
                                            Chargement de la base...
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Uploader un fichier Excel — réservé à « Gérer la base élèves » */}
                            {can('manage_students') && (
                                <label className="
                                    group relative inline-flex items-center gap-2 px-4 py-2.5 cursor-pointer
                                    backdrop-blur-2xl backdrop-saturate-150
                                    bg-white/70 border border-white/40
                                    rounded-2xl
                                    shadow-[0_8px_32px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                    hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)]
                                    transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
                                    hover:scale-105 active:scale-95
                                    text-sm font-semibold text-gray-800
                                ">
                                    <Upload className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                                    <span>Importer</span>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleUploadDatabase}
                                        className="hidden"
                                    />
                                </label>
                            )}

                            {/* Télécharger la base actuelle */}
                            <button
                                onClick={handleDownloadDatabase}
                                className="
                                    group relative inline-flex items-center gap-2 px-4 py-2.5
                                    backdrop-blur-2xl backdrop-saturate-150
                                    bg-white/70 border border-white/40
                                    rounded-2xl
                                    shadow-[0_8px_32px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                    hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)]
                                    transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
                                    hover:scale-105 active:scale-95
                                    text-sm font-semibold text-gray-800
                                "
                            >
                                <Download className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                                <span>Exporter</span>
                            </button>

                            {/* Statistiques */}
                            <Link
                                href="/verification-cartes/passage"
                                className="
                                    group relative inline-flex items-center gap-2 px-4 py-2.5
                                    backdrop-blur-2xl backdrop-saturate-150
                                    bg-white/70 border border-white/40
                                    rounded-2xl
                                    shadow-[0_8px_32px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                    hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)]
                                    transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
                                    hover:scale-105 active:scale-95
                                    text-sm font-semibold text-gray-800
                                "
                            >
                                <BarChart3 className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                                <span>Stats</span>
                            </Link>

                            {/* Recherche manuelle dans la base */}
                            {can('scan') && (
                                <button
                                    onClick={() => setSearchOpen(true)}
                                    className="
                                        group relative inline-flex items-center gap-2 px-4 py-2.5
                                        backdrop-blur-2xl backdrop-saturate-150
                                        bg-white/70 border border-white/40 rounded-2xl
                                        shadow-[0_8px_32px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                        hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.12)]
                                        transition-all duration-[350ms] hover:scale-105 active:scale-95
                                        text-sm font-semibold text-gray-800
                                    "
                                >
                                    <Search className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                                    <span>Rechercher</span>
                                </button>
                            )}

                            {/* Analyse IA (VLM Ollama gemma3:4b) — touche A */}
                            <button
                                onClick={analyzeWithVLM}
                                disabled={vlmAnalyzing}
                                title="Analyse IA du nom (gemma3:4b) — raccourci : touche A"
                                className="
                                    group relative inline-flex items-center gap-2 px-4 py-2.5
                                    bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl
                                    shadow-[0_8px_24px_0_rgba(139,92,246,0.35)]
                                    hover:shadow-[0_12px_32px_0_rgba(139,92,246,0.5)]
                                    transition-all duration-[350ms] hover:scale-105 active:scale-95
                                    text-sm font-semibold disabled:opacity-60
                                "
                            >
                                <Sparkles className="w-4 h-4" />
                                <span>Analyse IA</span>
                            </button>

                            {/* Bascule Auto IA (lance l'analyse dès qu'une carte est détectée) */}
                            <button
                                onClick={() => setAutoVlm(v => !v)}
                                title="Analyse IA automatique dès qu'une carte stable est détectée"
                                className={`
                                    inline-flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold
                                    transition-all duration-300 hover:scale-105 active:scale-95 border
                                    ${autoVlm
                                        ? 'bg-violet-600 text-white border-violet-500 shadow-[0_8px_24px_0_rgba(139,92,246,0.4)]'
                                        : 'bg-white/70 text-gray-700 border-white/40'}
                                `}
                            >
                                <span className={`w-2 h-2 rounded-full ${autoVlm ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
                                Auto
                            </button>

                            {/* Gestion des comptes (droit manage_accounts) */}
                            {can('manage_accounts') && (
                                <Link
                                    href="/verification-cartes/comptes"
                                    className="
                                        group relative inline-flex items-center gap-2 px-4 py-2.5
                                        backdrop-blur-2xl backdrop-saturate-150
                                        bg-white/70 border border-white/40 rounded-2xl
                                        shadow-[0_8px_32px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                        hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.12)]
                                        transition-all duration-[350ms] hover:scale-105 active:scale-95
                                        text-sm font-semibold text-gray-800
                                    "
                                >
                                    <Users className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                                    <span>Comptes</span>
                                </Link>
                            )}

                            {/* Plein écran (kiosque) */}
                            <button
                                onClick={toggleFullscreen}
                                title={isFullscreen ? 'Quitter le plein écran' : 'Mode plein écran (kiosque)'}
                                className="
                                    group relative inline-flex items-center gap-2 px-3 py-2.5
                                    backdrop-blur-2xl backdrop-saturate-150
                                    bg-white/70 border border-white/40 rounded-2xl
                                    shadow-[0_8px_32px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                    hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.12)]
                                    transition-all duration-[350ms] hover:scale-105 active:scale-95
                                    text-sm font-semibold text-gray-800
                                "
                            >
                                {isFullscreen
                                    ? <Minimize className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                                    : <Maximize className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />}
                            </button>

                            {/* Déconnexion (si connecté à Supabase) */}
                            {email && (
                                <button
                                    onClick={signOut}
                                    title={`Connecté : ${email}${can('manage_accounts') ? ' (admin)' : ''} — Se déconnecter`}
                                    className="
                                        group relative inline-flex items-center gap-2 px-3 py-2.5
                                        backdrop-blur-2xl backdrop-saturate-150
                                        bg-white/70 border border-white/40 rounded-2xl
                                        shadow-[0_8px_32px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                        hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.12)]
                                        transition-all duration-[350ms] hover:scale-105 active:scale-95
                                        text-sm font-semibold text-gray-800
                                    "
                                >
                                    <LogOut className="w-4 h-4 text-gray-700 group-hover:text-red-600 transition-colors" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-6 flex-grow flex flex-col justify-center">
                <div className="max-w-4xl mx-auto w-full">
                    {/* Camera Feed */}
                    <div className="relative bg-black rounded-3xl overflow-hidden h-[500px]">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-contain"
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        />

                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="relative w-96 h-96">
                                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
                                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
                                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
                                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
                                <div className="absolute inset-0 border-2 border-green-500/30 rounded-lg"></div>
                                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-white text-base bg-black/50 px-4 py-2 rounded-full whitespace-nowrap">
                                    Placez le QR code ici
                                </div>
                            </div>
                        </div>

                        {/* Status Indicator */}
                        <div className="absolute top-4 right-4 flex flex-col gap-2">
                            {!cameraError && stream && (
                                <div className="bg-green-500/80 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
                                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                    Scan QR actif
                                </div>
                            )}
                            {verificationStatus === 'processing' && (
                                <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
                                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                    Vérification...
                                </div>
                            )}
                        </div>

                        {cameraError && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="
                                    relative max-w-md mx-auto
                                    backdrop-blur-3xl backdrop-saturate-200
                                    bg-gradient-to-br from-red-50/95 via-red-50/90 to-white/85
                                    border border-red-200/50
                                    rounded-[2rem]
                                    shadow-[0_8px_32px_0_rgba(239,68,68,0.25),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                    p-8
                                ">
                                    <div className="absolute inset-0 bg-gradient-to-br from-red-100/40 via-red-50/30 to-white/20 rounded-[2rem]" />
                                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/40 to-transparent rounded-t-[2rem]" />

                                    <div className="relative z-10 flex flex-col items-center gap-6">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-red-600 rounded-full blur-2xl opacity-30 animate-pulse" />
                                            <div className="
                                                relative w-20 h-20
                                                bg-gradient-to-br from-red-500 to-red-700
                                                backdrop-blur-xl
                                                rounded-full
                                                flex items-center justify-center
                                                shadow-[0_8px_32px_0_rgba(239,68,68,0.4)]
                                                border border-red-300/30
                                            ">
                                                <CameraOff className="w-10 h-10 text-white drop-shadow-2xl" strokeWidth={2} />
                                                <AlertTriangle className="absolute w-6 h-6 text-white/90 top-2 right-2 drop-shadow-lg" strokeWidth={2.5} />
                                            </div>
                                            <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-red-500 animate-[ping_1.5s_ease-in-out_infinite]" />
                                            <Sparkles className="absolute -bottom-2 -left-2 w-4 h-4 text-red-400 animate-[ping_2s_ease-in-out_infinite]" />
                                        </div>

                                        <div className="text-center space-y-2">
                                            <h3 className="text-2xl font-bold text-red-900 drop-shadow-sm">
                                                Caméra inaccessible
                                            </h3>
                                            <p className="text-base text-red-800/90 font-medium">
                                                Impossible d&apos;accéder à la caméra
                                            </p>
                                            <p className="text-sm text-red-700/80">
                                                Vérifiez les permissions de votre navigateur
                                            </p>
                                        </div>

                                        <button
                                            onClick={startCamera}
                                            className="
                                                px-6 py-3
                                                bg-gradient-to-r from-red-500 to-red-600
                                                hover:from-red-600 hover:to-red-700
                                                text-white font-semibold
                                                rounded-2xl
                                                shadow-[0_4px_16px_0_rgba(239,68,68,0.3)]
                                                hover:shadow-[0_6px_24px_0_rgba(239,68,68,0.4)]
                                                transition-all duration-300
                                                hover:scale-105 active:scale-95
                                                pointer-events-auto
                                            "
                                        >
                                            Réessayer
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {verificationStatus === 'screenshot' && (
                            <div
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                style={{
                                    animation: isScreenshotExiting
                                        ? 'glassSlideOut 0.5s cubic-bezier(0.66, 0.33, 0, 1) forwards'
                                        : 'glassSlideIn 0.5s cubic-bezier(0.66, 0.33, 0, 1) forwards'
                                }}
                            >
                                <div className="
                                    relative max-w-md mx-auto
                                    backdrop-blur-3xl backdrop-saturate-200
                                    bg-gradient-to-br from-white/90 via-white/80 to-white/70
                                    border border-black/10
                                    rounded-[2rem]
                                    shadow-[0_8px_32px_0_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,0.8)]
                                    p-8
                                ">
                                    {/* Subtle gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 via-gray-50/30 to-white/20 rounded-[2rem]" />

                                    {/* Glass reflection effect */}
                                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/40 to-transparent rounded-t-[2rem]" />

                                    {/* Content */}
                                    <div className="relative z-10 flex flex-col items-center gap-6">
                                        {/* Animated Icon Container */}
                                        <div className="relative">
                                            {/* Subtle glow */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full blur-2xl opacity-20 animate-pulse" />

                                            {/* Icon circle */}
                                            <div className="
                                                relative w-20 h-20
                                                bg-gradient-to-br from-gray-800 to-black
                                                backdrop-blur-xl
                                                rounded-full
                                                flex items-center justify-center
                                                shadow-[0_8px_32px_0_rgba(0,0,0,0.25)]
                                                border border-black/20
                                                animate-[pulse_2s_ease-in-out_infinite]
                                            ">
                                                <ScanLine className="w-10 h-10 text-white drop-shadow-2xl animate-[spin_3s_linear_infinite]" strokeWidth={2} />
                                                <Search className="absolute w-6 h-6 text-white/90 top-2 right-2 drop-shadow-lg" strokeWidth={2.5} />
                                            </div>

                                            {/* Sparkles */}
                                            <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-gray-600 animate-[ping_1.5s_ease-in-out_infinite]" />
                                            <Sparkles className="absolute -bottom-2 -left-2 w-4 h-4 text-gray-500 animate-[ping_2s_ease-in-out_infinite]" />
                                        </div>

                                        {/* Text Content */}
                                        <div className="text-center space-y-2">
                                            <h3 className="text-2xl font-bold text-black drop-shadow-sm">
                                                Analyse approfondie
                                            </h3>
                                            <p className="text-base text-black/80 font-medium flex items-center justify-center gap-2">
                                                <Search className="w-4 h-4" strokeWidth={2.5} />
                                                {message || 'Recherche en cours...'}
                                            </p>
                                            <p className="text-sm text-black/60">
                                                Capture haute résolution en cours
                                            </p>
                                        </div>

                                        {/* Animated progress bar with loading effect */}
                                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="
                                                h-full
                                                bg-gradient-to-r from-gray-800 via-black to-gray-800
                                                rounded-full
                                                shadow-[0_0_20px_rgba(0,0,0,0.3)]
                                            " style={{
                                                width: '0%',
                                                animation: 'progressLoad 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                                                backgroundSize: '200% 100%'
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Flash de verdict plein écran (visible à distance) */}
                        <AnimatePresence>
                            {(verificationStatus === 'success' || verificationStatus === 'error') && studentInfo && (
                                <motion.div
                                    key={`flash-${isEligible}-${message}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: [0, 0.4, 0] }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.7, times: [0, 0.18, 1], ease: 'easeOut' }}
                                    className={`absolute inset-0 pointer-events-none ${isEligible ? 'bg-emerald-500' : 'bg-red-500'}`}
                                />
                            )}
                        </AnimatePresence>

                        {/* Carte de résultat — glassmorphism animé */}
                        <AnimatePresence mode="wait">
                            {(verificationStatus === 'success' || verificationStatus === 'error') && studentInfo && (
                                <motion.div
                                    key={`${studentInfo.prenom}-${studentInfo.nom}-${message}`}
                                    initial={{ y: 28, opacity: 0, scale: 0.95 }}
                                    animate={{ y: 0, opacity: 1, scale: 1 }}
                                    exit={{ y: 16, opacity: 0, scale: 0.98 }}
                                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                    className={`
                                        absolute inset-x-4 bottom-4
                                        backdrop-blur-2xl backdrop-saturate-150
                                        ${isEligible
                                            ? 'bg-gradient-to-r from-green-500/25 via-emerald-500/25 to-teal-500/25 border border-green-400/40'
                                            : 'bg-gradient-to-r from-red-500/25 via-rose-500/25 to-pink-500/25 border border-red-400/40'
                                        }
                                        rounded-2xl p-4 flex items-center gap-3
                                        shadow-[0_8px_32px_0_rgba(0,0,0,0.18)]
                                    `}
                                >
                                    <motion.div
                                        initial={{ scale: 0, rotate: -25 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: 'spring', stiffness: 520, damping: 17, delay: 0.08 }}
                                        className={`
                                            w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 backdrop-blur-xl
                                            ${isEligible
                                                ? 'bg-gradient-to-br from-green-400 to-emerald-600 shadow-[0_0_24px_rgba(34,197,94,0.5)]'
                                                : 'bg-gradient-to-br from-red-400 to-rose-600 shadow-[0_0_24px_rgba(239,68,68,0.5)]'
                                            }
                                        `}
                                    >
                                        {isEligible
                                            ? <Check className="w-6 h-6 text-white drop-shadow-lg" strokeWidth={3} />
                                            : <X className="w-6 h-6 text-white drop-shadow-lg" strokeWidth={3} />}
                                    </motion.div>
                                    <div className="flex-grow min-w-0">
                                        <motion.p
                                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}
                                            className="font-bold text-base truncate mb-1 text-white drop-shadow-lg">
                                            {message}
                                        </motion.p>
                                        <motion.p
                                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.17 }}
                                            className="text-sm truncate text-white/90 drop-shadow-md">
                                            {studentInfo.prenom} {studentInfo.nom}
                                        </motion.p>
                                        <motion.p
                                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.22 }}
                                            className="text-xs truncate text-white/80 drop-shadow-md">
                                            {studentInfo.classe}
                                        </motion.p>
                                        {confidence > 0 && confidence < 0.999 && (
                                            <p className="text-[10px] mt-0.5 text-white/70 drop-shadow-md flex items-center gap-1">
                                                <ScanLine className="w-3 h-3" />
                                                Reconnaissance par nom · confiance {Math.round(confidence * 100)}%
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Overlay d'analyse IA (VLM) */}
                        <AnimatePresence>
                            {vlmAnalyzing && (
                                <motion.div
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-md"
                                >
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0, y: 12 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        exit={{ scale: 0.95, opacity: 0 }}
                                        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                                        className="relative w-[min(88%,400px)] rounded-[2rem] p-8 border border-white/15 bg-white/5 backdrop-blur-2xl shadow-2xl"
                                    >
                                        <div className="flex flex-col items-center gap-5">
                                            <div className="relative w-20 h-20 flex items-center justify-center">
                                                <motion.div
                                                    className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-500 blur-lg opacity-70"
                                                    animate={{ scale: [1, 1.18, 1] }}
                                                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                                                />
                                                <motion.div
                                                    className="relative"
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
                                                >
                                                    <Sparkles className="w-10 h-10 text-white drop-shadow-lg" strokeWidth={1.8} />
                                                </motion.div>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-white font-bold text-lg">Analyse par IA</p>
                                                <p className="text-white/60 text-xs mt-1">gemma3:4b lit la carte…</p>
                                            </div>
                                            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                                                <motion.div
                                                    className="h-full w-1/3 rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400"
                                                    animate={{ x: ['-120%', '420%'] }}
                                                    transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Info */}
                    <div className="text-center text-gray-600 text-sm mt-8">
                        <CameraIcon className="w-4 h-4 inline-block mr-2" />
                        Présentez la carte devant la caméra
                    </div>
                </div>
            </main>

            {/* Footer Credits */}
            <footer className="container mx-auto px-6 py-4">
                <div className="text-left" style={{ fontFamily: 'Afacad Flux, sans-serif' }}>
                    <div className="text-[10px] text-black uppercase tracking-wide">
                        Application réalisée par
                    </div>
                    <a
                        href="https://newgenesis.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative inline-block text-[12px] text-black font-semibold uppercase tracking-wider mt-0.5 transition-colors duration-500 hover:text-gray-500"
                        style={{ fontFamily: 'Afacad Flux, sans-serif' }}
                    >
                        NEWGENESIS
                        <span className="absolute left-0 bottom-0 w-full h-[2px] bg-black transition-transform duration-500 scale-x-0 origin-right group-hover:scale-x-100 group-hover:origin-left" />
                    </a>
                </div>
            </footer>

            {/* Modale de recherche manuelle */}
            <AnimatePresence>
                {searchOpen && (
                    <motion.div
                        key="search-overlay"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setSearchOpen(false)}
                        className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[10vh] px-4"
                    >
                        <motion.div
                            initial={{ y: 22, opacity: 0, scale: 0.97 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 12, opacity: 0, scale: 0.98 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                                <Search className="w-5 h-5 text-gray-400" />
                                <input
                                    autoFocus
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Nom, prénom ou classe…"
                                    className="flex-1 text-base outline-none bg-transparent"
                                />
                                <button onClick={() => setSearchOpen(false)} className="text-gray-400 hover:text-black transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="max-h-[55vh] overflow-y-auto">
                                {searchQuery.trim().length === 0 ? (
                                    <p className="px-5 py-10 text-center text-gray-400 text-sm">Tapez un nom, un prénom ou une classe…</p>
                                ) : searchResults.length === 0 ? (
                                    <p className="px-5 py-10 text-center text-gray-400 text-sm">Aucun élève trouvé.</p>
                                ) : (
                                    searchResults.map((s, i) => {
                                        const eligible = s.eligible?.toLowerCase() === 'oui';
                                        return (
                                            <button
                                                key={`${s.nom}-${s.prenom}-${i}`}
                                                onClick={() => validateManual(s)}
                                                className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 border-b border-gray-50 text-left transition-colors"
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-black truncate">{s.prenom} {s.nom}</p>
                                                    <p className="text-xs text-gray-500 truncate">{s.classe || '—'}</p>
                                                </div>
                                                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${eligible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {eligible ? 'Éligible' : 'Non éligible'}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            <div className="px-5 py-3 bg-gray-50 text-xs text-gray-400 text-center">
                                Cliquez sur un élève pour valider son accès manuellement.
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
