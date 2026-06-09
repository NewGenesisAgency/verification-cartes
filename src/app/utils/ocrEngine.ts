/**
 * Moteur OCR pluggable.
 *
 * - `tesseract` (défaut) : rapide, léger, hors-ligne (worker singleton).
 * - `neural` : TrOCR (transformer Microsoft) via Transformers.js — bien plus
 *   puissant sur texte difficile, mais plus lourd/lent. Activé via
 *   NEXT_PUBLIC_OCR_ENGINE=neural. **Repli automatique sur Tesseract** si le
 *   modèle ne charge pas (réseau, navigateur, etc.) → la borne ne casse jamais.
 *
 * Le modèle TrOCR (~quelques dizaines de Mo) est téléchargé au 1er usage depuis
 * le hub Hugging Face puis mis en cache navigateur. Pour du 100 % hors-ligne,
 * déposer les fichiers dans public/models et passer env.allowLocalModels=true.
 */

import { recognizeText } from './ocrWorker';
import { canvasToBlob } from './imageProcessing';
import { debugLog } from './debug';

export const OCR_ENGINE: 'neural' | 'tesseract' =
    process.env.NEXT_PUBLIC_OCR_ENGINE === 'neural' ? 'neural' : 'tesseract';

const TROCR_MODEL = process.env.NEXT_PUBLIC_TROCR_MODEL || 'Xenova/trocr-small-printed';

// ---- Tesseract -------------------------------------------------------------
async function tesseractRecognize(canvas: HTMLCanvasElement): Promise<string> {
    const blob = await canvasToBlob(canvas);
    return recognizeText(blob);
}

// ---- TrOCR (Transformers.js) ----------------------------------------------
type ImageToText = (input: string) => Promise<Array<{ generated_text: string }>>;
let trocrPromise: Promise<ImageToText | null> | null = null;

function loadTrocr(): Promise<ImageToText | null> {
    if (!trocrPromise) {
        trocrPromise = (async () => {
            try {
                const { pipeline, env } = await import('@huggingface/transformers');
                // Aller directement au hub (évite des 404 sur /models si non bundlé).
                env.allowLocalModels = false;
                const pipe = await pipeline('image-to-text', TROCR_MODEL);
                debugLog('[OCR] Moteur neuronal TrOCR prêt.');
                return pipe as unknown as ImageToText;
            } catch (e) {
                debugLog('[OCR] TrOCR indisponible → repli Tesseract.', e);
                return null;
            }
        })();
    }
    return trocrPromise;
}

async function neuralRecognize(canvas: HTMLCanvasElement): Promise<string> {
    const pipe = await loadTrocr();
    if (!pipe) return tesseractRecognize(canvas); // repli
    try {
        const out = await pipe(canvas.toDataURL('image/png'));
        return out?.[0]?.generated_text ?? '';
    } catch {
        return tesseractRecognize(canvas);
    }
}

// ---- API publique ----------------------------------------------------------
/** Pré-charge le moteur sélectionné (à appeler au montage). */
export function preloadOcrEngine(): void {
    if (OCR_ENGINE === 'neural') void loadTrocr();
}

/** Reconnaît le texte d'un canvas avec le moteur sélectionné (repli Tesseract). */
export async function ocrRecognize(canvas: HTMLCanvasElement): Promise<string> {
    return OCR_ENGINE === 'neural' ? neuralRecognize(canvas) : tesseractRecognize(canvas);
}
