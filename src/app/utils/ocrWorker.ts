/**
 * Gestionnaire de worker Tesseract SINGLETON.
 *
 * Avant : un worker était créé (téléchargement + init du modèle FR) PUIS détruit
 * à CHAQUE frame analysée (toutes les 500 ms). C'était le principal goulot
 * d'étranglement de l'application.
 *
 * Maintenant : un seul worker est initialisé une fois, réutilisé pour toutes les
 * reconnaissances, et les appels sont sérialisés (un worker Tesseract ne peut
 * traiter qu'une image à la fois).
 */

import { createWorker, PSM, type Worker } from 'tesseract.js';
import { debugLog } from './debug';

const OCR_PARAMS = {
    // Majuscules ET minuscules (les prénoms sont en Title case, ex. « Maxime »).
    tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ" +
        "abcdefghijklmnopqrstuvwxyzàâäéèêëïîôöùûüç -'",
    preserve_interword_spaces: '1',
    // La zone OCR est recadrée sur le bloc nom (une colonne) → bloc uniforme,
    // ce qui préserve l'ordre des lignes (prénom puis NOM) pour le découpage.
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
};

let workerPromise: Promise<Worker> | null = null;
// File d'attente : garantit qu'une seule reconnaissance tourne à la fois.
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
    if (!workerPromise) {
        workerPromise = (async () => {
            debugLog('[OCR] Initialisation du worker Tesseract (une seule fois)...');
            const worker = await createWorker('fra');
            await worker.setParameters(OCR_PARAMS);
            debugLog('[OCR] Worker prêt.');
            return worker;
        })();
    }
    return workerPromise;
}

/**
 * Pré-charge le worker pour que la première reconnaissance soit instantanée.
 * À appeler dès le montage de la page de scan.
 */
export function preloadOCR(): void {
    void getWorker().catch(() => {
        // En cas d'échec, on réessaiera au prochain appel.
        workerPromise = null;
    });
}

/**
 * Reconnaît le texte d'une image. Les appels sont mis en file pour ne jamais
 * solliciter le worker en parallèle.
 */
export async function recognizeText(image: Blob | HTMLCanvasElement): Promise<string> {
    const run = queue.then(async () => {
        const worker = await getWorker();
        const { data: { text } } = await worker.recognize(image);
        return text;
    });
    // On chaîne la file en ignorant les erreurs pour ne pas bloquer les appels suivants.
    queue = run.catch(() => undefined);
    return run;
}

/**
 * Libère le worker (à appeler au démontage de la page).
 */
export async function terminateOCR(): Promise<void> {
    if (!workerPromise) return;
    const promise = workerPromise;
    workerPromise = null;
    try {
        const worker = await promise;
        await worker.terminate();
    } catch {
        // déjà détruit
    }
}
