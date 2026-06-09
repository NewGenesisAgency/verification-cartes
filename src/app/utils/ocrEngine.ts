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

export type OcrEngineName = 'neural' | 'tesseract' | 'ollama';
export const OCR_ENGINE: OcrEngineName =
    process.env.NEXT_PUBLIC_OCR_ENGINE === 'neural' ? 'neural'
        : process.env.NEXT_PUBLIC_OCR_ENGINE === 'ollama' ? 'ollama'
            : 'tesseract';

const TROCR_MODEL = process.env.NEXT_PUBLIC_TROCR_MODEL || 'Xenova/trocr-small-printed';

// Ollama (VLM local) — gemma3:4b (multimodal). gemma3:1b NE gère PAS l'image.
const OLLAMA_URL = process.env.NEXT_PUBLIC_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.NEXT_PUBLIC_OLLAMA_MODEL || 'gemma3:4b';

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

// ---- Ollama (VLM local, ex. gemma3:4b) ------------------------------------
/** Reconnaissance par VLM Ollama. Exporté pour le déclenchement manuel. */
export async function recognizeOllama(canvas: HTMLCanvasElement): Promise<string> {
    try {
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: "Cette image montre le prénom puis le NOM d'un élève (au-dessus du nom du lycée). "
                    + 'Réponds UNIQUEMENT par "Prénom NOM", sans ponctuation ni autre texte.',
                images: [base64],
                stream: false,
                keep_alive: '30m',   // garde le modèle chargé → pas de cold start
                options: { temperature: 0 },
            }),
        });
        if (!res.ok) return tesseractRecognize(canvas);
        const json = await res.json();
        const out = (json?.response ?? '').trim();
        return out.length > 0 ? out : tesseractRecognize(canvas);
    } catch (e) {
        debugLog('[OCR] Ollama indisponible → repli Tesseract.', e);
        return tesseractRecognize(canvas);
    }
}

/** Charge le modèle Ollama en mémoire (évite le cold start au 1er scan). */
export async function warmOllama(): Promise<void> {
    try {
        await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: OLLAMA_MODEL, prompt: 'ok', stream: false, keep_alive: '30m' }),
        });
        debugLog('[OCR] Ollama préchargé.');
    } catch { /* ignore */ }
}

// ---- API publique ----------------------------------------------------------
/** Pré-charge le moteur sélectionné (à appeler au montage). */
export function preloadOcrEngine(): void {
    if (OCR_ENGINE === 'neural') void loadTrocr();
    if (OCR_ENGINE === 'ollama') void warmOllama();
}

/** Reconnaît le texte d'un canvas avec le moteur sélectionné (repli Tesseract). */
export async function ocrRecognize(canvas: HTMLCanvasElement): Promise<string> {
    if (OCR_ENGINE === 'neural') return neuralRecognize(canvas);
    if (OCR_ENGINE === 'ollama') return recognizeOllama(canvas);
    return tesseractRecognize(canvas);
}
