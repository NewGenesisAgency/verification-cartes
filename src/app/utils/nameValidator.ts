/**
 * Validation sémantique avec IA (NLP + base mondiale)
 * Utilise Compromise + human-names (17000+ prénoms mondiaux)
 */

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

// Cache pour éviter de recalculer
const nameCache = new Map<string, boolean>();

// Base minimale de prénoms français pour fallback
const COMMON_FIRST_NAMES_FALLBACK = [
    'jean', 'pierre', 'paul', 'jacques', 'michel', 'andre', 'philippe', 'alain', 'bernard', 'christian',
    'daniel', 'patrick', 'gerard', 'rene', 'francois', 'claude', 'yves', 'robert', 'henri', 'louis',
    'marc', 'eric', 'olivier', 'laurent', 'pascal', 'vincent', 'didier', 'thierry', 'bruno', 'christophe',
    'stephane', 'sebastien', 'julien', 'frederic', 'nicolas', 'jerome', 'david', 'emmanuel', 'matthieu', 'alexandre',
    
    // Prénoms masculins modernes
    'thomas', 'antoine', 'maxime', 'clement', 'lucas', 'hugo', 'theo', 'nathan', 'enzo', 'gabriel',
    'arthur', 'jules', 'louis', 'raphael', 'noah', 'ethan', 'nolan', 'tom', 'adam', 'leo',
    'paul', 'victor', 'martin', 'axel', 'romain', 'baptiste', 'quentin', 'valentin', 'simon', 'pierre',
    'tom', 'leo', 'max', 'tim', 'sam', 'ben', 'dan', 'jim', 'bob', 'joe', 'teo', 'ted', 'ian', 'yan',
    
    // Prénoms féminins français classiques
    'marie', 'jeanne', 'francoise', 'monique', 'catherine', 'martine', 'isabelle', 'christine', 'sylvie', 'nicole',
    'nathalie', 'chantal', 'michele', 'jacqueline', 'dominique', 'brigitte', 'veronique', 'corinne', 'laurence', 'sandrine',
    'valerie', 'stephanie', 'patricia', 'anne', 'sophie', 'helene', 'caroline', 'florence', 'karine', 'delphine',
    
    // Prénoms féminins modernes
    'emma', 'jade', 'lea', 'chloe', 'manon', 'camille', 'sarah', 'laura', 'julie', 'clara',
    'alice', 'louise', 'lola', 'rose', 'anna', 'juliette', 'zoe', 'eva', 'romane', 'mila',
    'charlotte', 'mia', 'lisa', 'nina', 'luna', 'valentine', 'ambre', 'oceane', 'elise', 'marine',
    'lea', 'zoe', 'eva', 'lou', 'mia', 'lya', 'aya', 'amy', 'eve', 'lia', 'emy', 'noe',
    
    // Prénoms arabes
    'mohamed', 'ahmed', 'ali', 'omar', 'youssef', 'ibrahim', 'hassan', 'karim', 'amine', 'rachid',
    'samir', 'malik', 'sofiane', 'mehdi', 'bilal', 'yanis', 'adam', 'ilyes', 'imran', 'rayan',
    'fatima', 'aicha', 'khadija', 'yasmine', 'sarah', 'amina', 'leila', 'nadia', 'samira', 'latifa',
    'rania', 'salma', 'ines', 'meryem', 'lina', 'nour', 'malak', 'sarah', 'amira', 'zainab',
    
    // Prénoms internationaux
    'john', 'james', 'michael', 'david', 'william', 'richard', 'joseph', 'thomas', 'charles', 'daniel',
    'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
    'maxime', 'theo', 'axel', 'bonnevay', 'trompier' // Ajoutés de ta base
];

const COMMON_LAST_NAMES_FALLBACK = [
    'martin', 'bernard', 'thomas', 'petit', 'robert', 'bonnevay', 'trompier'
];

const BLACKLIST_WORDS = [
    'carte', 'etudiant', 'classe', 'annee', 'date', 'nom', 'prenom',
    'document', 'identite', 'photo', 'signature', 'numero', 'valide', 'expire', 'naissance',
    'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais',
    // Préfixes d'ÉTABLISSEMENT (jamais un nom de personne) — pas les noms d'écoles eux-mêmes.
    'lycee', 'lpo', 'lgt', 'college', 'ecole', 'cfa', 'erea', 'sep',
    // Texte parasite récurrent du Pass Région
    'region', 'auvergne', 'rhone', 'alpes', 'pass', 'passregion', 'dossier', 'valable',
    'formation', 'conservez', 'telechargez', 'rejoignez', 'appli', 'infos', 'jeunes',
    'votre', 'sur', 'durant', 'toute', 'nous',
];

function normalize(word: string): string {
    return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isInFallbackDB(word: string): boolean {
    const normalized = normalize(word);
    return COMMON_FIRST_NAMES_FALLBACK.includes(normalized) || COMMON_LAST_NAMES_FALLBACK.includes(normalized);
}

function fallbackIsName(word: string): boolean {
    if (word.length <= 2) return false;
    if (word[0] !== word[0].toUpperCase()) return false;
    const normalized = normalize(word);
    if (BLACKLIST_WORDS.includes(normalized)) return false;
    if (isInFallbackDB(word)) return true;
    if (!/[AEIOUYÀÂÄÉÈÊËÏÎÔÖÙÛÜ]/.test(word)) return false;
    if (/[BCDFGHJKLMNPQRSTVWXZ]{4,}/.test(word)) return false;
    if (/(.)\1{3,}/.test(word)) return false;
    return true;
}

/**
 * Détection sémantique avec IA TRIPLE CHECK
 * 1. human-names (17000+ prénoms mondiaux)
 * 2. Compromise (NLP sémantique)
 * 3. Fallback (règles heuristiques)
 */
export async function isValidHumanName(word: string): Promise<boolean> {
    if (nameCache.has(word)) return nameCache.get(word)!;
    
    if (!word || word.length <= 2) {
        debugLog(`"${word}" → 0% (≤2 caractères)`);
        nameCache.set(word, false);
        return false;
    }
    
    if (word.length > 20) {
        debugLog(`"${word}" → 0% (trop long)`);
        nameCache.set(word, false);
        return false;
    }
    
    const normalized = normalize(word);
    if (BLACKLIST_WORDS.includes(normalized)) {
        debugLog(`"${word}" → 0% (blacklist)`);
        nameCache.set(word, false);
        return false;
    }
    
    let confidence = 0;
    let source = '';
    
    const hn = await initHumanNames();
    if (hn) {
        try {
            if (hn.allFirstNames.includes(normalized)) {
                confidence = 99;
                source = 'human-names';
                debugLog(`"${word}" → ${confidence}% (${source})`);
                nameCache.set(word, true);
                return true;
            }
        } catch {
        }
    }
    
    const nlpInstance = await initNLP();
    if (nlpInstance) {
        try {
            const doc = nlpInstance(word);
            const people = doc.people();
            const properNouns = doc.nouns().isProperNoun();
            if (people.length > 0 || properNouns.length > 0) {
                confidence = 90;
                source = people.length > 0 ? 'NLP-personne' : 'NLP-nom propre';
                debugLog(`"${word}" → ${confidence}% (${source})`);
                nameCache.set(word, true);
                return true;
            }
        } catch {
        }
    }
    
    const result = fallbackIsName(word);
    if (result) {
        confidence = 70;
        source = 'heuristique';
        debugLog(`"${word}" → ${confidence}% (${source})`);
    } else {
        debugLog(`"${word}" → 0% (rejeté)`);
    }
    
    nameCache.set(word, result);
    return result;
}

export function isValidHumanNameSync(word: string): boolean {
    if (!word || word.length <= 2 || word.length > 20) return false;
    const normalized = normalize(word);
    if (BLACKLIST_WORDS.includes(normalized)) return false;
    return fallbackIsName(word);
}

/**
 * Fonction de compatibilité avec l'ancien code (async)
 */
export async function validateName(word: string): Promise<boolean> {
    return await isValidHumanName(word);
}

/**
 * Version synchrone pour compatibilité (utilise fallback)
 */
export function validateNameSync(word: string): boolean {
    return isValidHumanNameSync(word);
}
