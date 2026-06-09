/**
 * Détection et appariement nom/prénom.
 *
 * - Validation sémantique d'un mot (est-ce un nom de personne ?) via
 *   human-names (17 000+ prénoms) + Compromise (NLP) + heuristiques.
 * - Appariement TOLÉRANT AUX ERREURS OCR : confusions de caractères fréquentes
 *   (0↔O, 1↔I, 5↔S, 8↔B…) corrigées, puis distance de Levenshtein avec une
 *   tolérance proportionnelle à la longueur du mot. Chaque correspondance porte
 *   un score de confiance (0–1).
 */

import * as XLSX from 'xlsx';
import { debugLog } from './debug';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nlp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let humanNames: any = null;

async function initNLP() {
    if (nlp) return nlp;
    try {
        const compromiseModule = await import('compromise');
        nlp = compromiseModule.default;
        return nlp;
    } catch {
        return null;
    }
}

async function initHumanNames() {
    if (humanNames) return humanNames;
    try {
        humanNames = await import('human-names');
        return humanNames;
    } catch {
        return null;
    }
}

export interface Student {
    nom: string;
    prenom: string;
    classe: string;
    eligible?: string;
    numero?: string;
}

export interface DetectionResult {
    student: Student | null;
    isValidMatch: boolean;
    needsScreenshot: boolean;
    /** Confiance de l'appariement (0–1). */
    confidence: number;
    partialMatch?: {
        foundWord: string;
        isNom: boolean;
        isPrenom: boolean;
        possibleMatches: Student[];
    };
}

/** Seuil d'acceptation d'un appariement complet (prénom + nom). */
const ACCEPT_THRESHOLD = 0.82;

/**
 * Normaliser les accents (é → e, à → a, etc.)
 */
export function normalizeAccents(str: string): string {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Normalisation + correction des confusions OCR les plus fréquentes.
 */
function ocrNormalize(str: string): string {
    return normalizeAccents(str)
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/5/g, 's')
        .replace(/8/g, 'b')
        .replace(/[^a-z]/g, '');
}

/**
 * Décomposer les noms composés (Jean-Pierre → ['jean', 'pierre'])
 */
export function decomposeNom(nom: string): string[] {
    return normalizeAccents(nom).split(/[-\s]+/).map(part => part.trim()).filter(part => part.length > 0);
}

/** Distance de Levenshtein (édition). */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    let curr = new Array<number>(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

/**
 * Similarité tolérante OCR entre deux mots (0–1). Les mots courts exigent une
 * correspondance quasi exacte ; les mots longs tolèrent quelques erreurs.
 */
function similarity(a: string, b: string): number {
    const na = ocrNormalize(a);
    const nb = ocrNormalize(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const maxLen = Math.max(na.length, nb.length);
    // Les mots de ≤3 lettres doivent être identiques (sinon trop de faux positifs).
    if (maxLen <= 3) return 0;
    return 1 - levenshtein(na, nb) / maxLen;
}

/** Meilleure similarité d'un mot face aux parties d'un nom/prénom composé. */
function bestPartSimilarity(word: string, parts: string[]): number {
    let best = 0;
    for (const part of parts) {
        const s = similarity(word, part);
        if (s > best) best = s;
    }
    return best;
}

/**
 * Vérifie si un mot est dans la base human-names (17000+ prénoms mondiaux)
 */
async function isInHumanNamesDB(word: string): Promise<boolean> {
    const hn = await initHumanNames();
    if (!hn) return false;
    try {
        return hn.allFirstNames.includes(word.toLowerCase());
    } catch {
        return false;
    }
}

/**
 * Détecter si un mot est un nom/prénom (human-names → NLP → heuristique).
 */
export async function isPersonNameSemantic(word: string): Promise<boolean> {
    if (word.length <= 2) return false;

    if (await isInHumanNamesDB(word)) {
        debugLog(`"${word}" → nom (human-names)`);
        return true;
    }

    const nlpInstance = await initNLP();
    if (nlpInstance) {
        try {
            const doc = nlpInstance(word);
            if (doc.people().length > 0 || doc.nouns().isProperNoun().length > 0) {
                debugLog(`"${word}" → nom (NLP)`);
                return true;
            }
        } catch {
            // ignore
        }
    }

    if (fallbackIsPersonName(word)) {
        debugLog(`"${word}" → nom (heuristique)`);
        return true;
    }

    return false;
}

function fallbackIsPersonName(word: string): boolean {
    if (word.length <= 2) return false;
    if (word[0] !== word[0].toUpperCase()) return false;
    const blacklist = ['CARTE', 'ETUDIANT', 'CLASSE', 'LE', 'LA', 'LES', 'UN', 'UNE'];
    if (blacklist.includes(word.toUpperCase())) return false;
    if (!/[AEIOUYÀÂÄÉÈÊËÏÎÔÖÙÛÜ]/.test(word)) return false;
    return true;
}

/**
 * Trouver les étudiants dont une partie du nom/prénom correspond (tolérant OCR).
 */
export async function findPartialMatch(word: string, databaseStudents: Student[]): Promise<{
    asPrenom: Student[];
    asNom: Student[];
}> {
    const isName = await isPersonNameSemantic(word);
    if (!isName) {
        return { asPrenom: [], asNom: [] };
    }

    const asPrenom: Student[] = [];
    const asNom: Student[] = [];

    for (const student of databaseStudents) {
        const rowNomParts = decomposeNom(student.nom || '');
        const rowPrenomParts = decomposeNom(student.prenom || '');

        if (bestPartSimilarity(word, rowPrenomParts) >= ACCEPT_THRESHOLD) {
            asPrenom.push(student);
        }
        if (bestPartSimilarity(word, rowNomParts) >= ACCEPT_THRESHOLD) {
            asNom.push(student);
        }
    }

    return { asPrenom, asNom };
}

/**
 * Meilleur appariement (prénom + nom) entre une liste de mots et un étudiant.
 * Retourne le score moyen des deux meilleures parties appariées.
 */
function scoreStudent(words: string[], student: Student): number {
    const prenomParts = decomposeNom(student.prenom || '');
    const nomParts = decomposeNom(student.nom || '');
    if (prenomParts.length === 0 || nomParts.length === 0) return 0;

    let bestPrenom = 0;
    let bestPrenomIdx = -1;
    let bestNom = 0;
    let bestNomIdx = -1;

    words.forEach((word, idx) => {
        const sp = bestPartSimilarity(word, prenomParts);
        const sn = bestPartSimilarity(word, nomParts);
        if (sp > bestPrenom) { bestPrenom = sp; bestPrenomIdx = idx; }
        if (sn > bestNom) { bestNom = sn; bestNomIdx = idx; }
    });

    // On exige deux mots DISTINCTS (un pour le prénom, un pour le nom).
    if (bestPrenomIdx === -1 || bestNomIdx === -1 || bestPrenomIdx === bestNomIdx) {
        return 0;
    }
    if (bestPrenom < ACCEPT_THRESHOLD || bestNom < ACCEPT_THRESHOLD) return 0;

    return (bestPrenom + bestNom) / 2;
}

/**
 * Comparer 2 mots et vérifier s'ils correspondent au même étudiant (compat).
 */
export function compareWords(word1: string, word2: string, databaseStudents: Student[]): Student | null {
    let best: { student: Student; score: number } | null = null;
    for (const student of databaseStudents) {
        const score = scoreStudent([word1, word2], student);
        if (score >= ACCEPT_THRESHOLD && (!best || score > best.score)) {
            best = { student, score };
        }
    }
    return best?.student ?? null;
}

/**
 * Détecter un étudiant à partir de plusieurs mots, avec score de confiance.
 */
export async function detectWithMultipleWords(words: string[], databaseStudents: Student[]): Promise<DetectionResult> {
    if (words.length === 0) {
        return { student: null, isValidMatch: false, needsScreenshot: false, confidence: 0 };
    }

    // 1 seul mot : on ne peut pas valider une identité complète → screenshot.
    if (words.length === 1) {
        const partial = await findPartialMatch(words[0], databaseStudents);
        const totalMatches = partial.asPrenom.length + partial.asNom.length;
        if (totalMatches > 0) {
            return {
                student: null,
                isValidMatch: false,
                needsScreenshot: true,
                confidence: 0,
                partialMatch: {
                    foundWord: words[0],
                    isNom: partial.asNom.length > 0,
                    isPrenom: partial.asPrenom.length > 0,
                    possibleMatches: [...partial.asPrenom, ...partial.asNom],
                },
            };
        }
        return { student: null, isValidMatch: false, needsScreenshot: false, confidence: 0 };
    }

    // 2+ mots : on cherche le meilleur étudiant (prénom + nom) sur l'ensemble.
    let best: { student: Student; score: number } | null = null;
    for (const student of databaseStudents) {
        const score = scoreStudent(words, student);
        if (score >= ACCEPT_THRESHOLD && (!best || score > best.score)) {
            best = { student, score };
        }
    }

    if (best) {
        debugLog(`Match: ${best.student.prenom} ${best.student.nom} (${Math.round(best.score * 100)}%)`);
        return { student: best.student, isValidMatch: true, needsScreenshot: false, confidence: best.score };
    }

    return { student: null, isValidMatch: false, needsScreenshot: false, confidence: 0 };
}

/**
 * Ajouter automatiquement un étudiant dans Excel (téléchargement côté client).
 */
export async function addStudentToExcel(student: Student, excelPath: string = '/data/database.xlsx'): Promise<boolean> {
    try {
        const response = await fetch(excelPath);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data: unknown[] = XLSX.utils.sheet_to_json(worksheet);

        data.push({
            nom: student.nom,
            prenom: student.prenom,
            classe: student.classe,
            eligible: student.eligible,
        });

        const newWorksheet = XLSX.utils.json_to_sheet(data);
        workbook.Sheets[sheetName] = newWorksheet;

        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'database_updated.xlsx';
        link.click();
        window.URL.revokeObjectURL(url);
        return true;
    } catch {
        return false;
    }
}
