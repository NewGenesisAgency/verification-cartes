/**
 * Pipeline de vision avancé pour préparer l'image avant OCR :
 *   1. Niveaux de gris (ROI upscalée)
 *   2. Deskew (redressement de l'inclinaison via projection cisaillée)
 *   3. Binarisation adaptative Sauvola (robuste aux éclairages inégaux)
 *   4. Détection des lignes de texte (projection + extension horizontale)
 *   5. Recadrage sur le bloc de texte (le nom) → image propre pour Tesseract/TrOCR
 *
 * Tout est borné et tombe en repli (image grise simple) si une étape échoue.
 */

import { type ROI, enhanceForOCR } from './imageProcessing';

interface Box { x: number; y: number; w: number; h: number; }

/** Boîte de ligne détectée, exprimée en coordonnées VIDÉO (pour l'overlay). */
export interface DetectedBox { x: number; y: number; w: number; h: number; }

export interface PreparedOcr {
    canvas: HTMLCanvasElement;
    boxes: DetectedBox[];
}

function grayCanvas(source: CanvasImageSource, roi: ROI, scale: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(roi.width * scale);
    canvas.height = Math.round(roi.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, roi.x, roi.y, roi.width, roi.height, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

function toGrayArray(canvas: HTMLCanvasElement): { gray: Uint8ClampedArray; w: number; h: number } {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = d[i];
    return { gray, w, h };
}

/** Binarisation Sauvola via images intégrales. 0 = texte (sombre), 255 = fond. */
function sauvola(gray: Uint8ClampedArray, w: number, h: number, win = 25, k = 0.2): Uint8ClampedArray {
    const R = 128;
    const half = Math.max(3, Math.floor(win / 2));
    const iw = w + 1;
    const integral = new Float64Array(iw * (h + 1));
    const integralSq = new Float64Array(iw * (h + 1));
    for (let y = 1; y <= h; y++) {
        let s = 0, sq = 0;
        for (let x = 1; x <= w; x++) {
            const v = gray[(y - 1) * w + (x - 1)];
            s += v; sq += v * v;
            integral[y * iw + x] = integral[(y - 1) * iw + x] + s;
            integralSq[y * iw + x] = integralSq[(y - 1) * iw + x] + sq;
        }
    }
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
            const area = (x1 - x0) * (y1 - y0);
            const sum = integral[y1 * iw + x1] - integral[y0 * iw + x1] - integral[y1 * iw + x0] + integral[y0 * iw + x0];
            const sqSum = integralSq[y1 * iw + x1] - integralSq[y0 * iw + x1] - integralSq[y1 * iw + x0] + integralSq[y0 * iw + x0];
            const mean = sum / area;
            const variance = Math.max(0, sqSum / area - mean * mean);
            const std = Math.sqrt(variance);
            const threshold = mean * (1 + k * (std / R - 1));
            out[y * w + x] = gray[y * w + x] > threshold ? 255 : 0;
        }
    }
    return out;
}

/** Estime l'angle d'inclinaison (radians) maximisant la variance de projection. */
function estimateSkew(bin: Uint8ClampedArray, w: number, h: number): number {
    let bestAngle = 0, bestScore = -1;
    for (let deg = -8; deg <= 8; deg += 2) {
        const t = Math.tan((deg * Math.PI) / 180);
        const off = Math.ceil(Math.abs(t) * w) + 1;
        const hist = new Float64Array(h + 2 * off + 2);
        for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
                if (bin[y * w + x] === 0) {
                    const idx = y + Math.round(x * t) + off;
                    if (idx >= 0 && idx < hist.length) hist[idx]++;
                }
            }
        }
        let mean = 0;
        for (let i = 0; i < hist.length; i++) mean += hist[i];
        mean /= hist.length;
        let varr = 0;
        for (let i = 0; i < hist.length; i++) { const d = hist[i] - mean; varr += d * d; }
        if (varr > bestScore) { bestScore = varr; bestAngle = (deg * Math.PI) / 180; }
    }
    return bestAngle;
}

function rotateCanvas(src: HTMLCanvasElement, angle: number): HTMLCanvasElement {
    const w = src.width, h = src.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.drawImage(src, -w / 2, -h / 2);
    return out;
}

/** Détecte les boîtes de lignes de texte (projection lignes + extension colonnes). */
function detectLines(bin: Uint8ClampedArray, w: number, h: number): Box[] {
    const rowInk = new Int32Array(h);
    for (let y = 0; y < h; y++) {
        let c = 0; const base = y * w;
        for (let x = 0; x < w; x++) if (bin[base + x] === 0) c++;
        rowInk[y] = c;
    }
    const thr = Math.max(3, w * 0.02);
    const maxGap = Math.round(h * 0.012) + 2;
    const bands: [number, number][] = [];
    let start = -1, gap = 0;
    for (let y = 0; y < h; y++) {
        if (rowInk[y] > thr) { if (start < 0) start = y; gap = 0; }
        else if (start >= 0) { gap++; if (gap > maxGap) { bands.push([start, y - gap]); start = -1; gap = 0; } }
    }
    if (start >= 0) bands.push([start, h - 1]);

    const boxes: Box[] = [];
    for (const [y0, y1] of bands) {
        const bh = y1 - y0 + 1;
        if (bh < h * 0.02) continue;
        let xMin = w, xMax = 0;
        for (let y = y0; y <= y1; y++) {
            const base = y * w;
            for (let x = 0; x < w; x++) if (bin[base + x] === 0) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
        }
        const bw = xMax - xMin + 1;
        if (bw < w * 0.1 || bw / bh < 2) continue; // les lignes sont larges
        boxes.push({ x: xMin, y: y0, w: bw, h: bh });
    }
    return boxes;
}

/**
 * Prépare un canvas binarisé, redressé et recadré sur le bloc de texte,
 * prêt à passer à l'OCR. Repli sur l'amélioration simple en cas de souci.
 */
export function prepareForOcr(source: CanvasImageSource, roi: ROI, scale = 2): PreparedOcr {
    try {
        let canvas = grayCanvas(source, roi, scale);
        let { gray, w, h } = toGrayArray(canvas);

        // Deskew (sur binaire grossier global = moyenne).
        let mean = 0;
        for (let i = 0; i < gray.length; i++) mean += gray[i];
        mean /= gray.length;
        const coarse = new Uint8ClampedArray(w * h);
        for (let i = 0; i < gray.length; i++) coarse[i] = gray[i] > mean ? 255 : 0;
        const angle = estimateSkew(coarse, w, h);
        if (Math.abs(angle) > 0.018) {
            canvas = rotateCanvas(canvas, -angle);
            ({ gray, w, h } = toGrayArray(canvas));
        }

        // Binarisation adaptative (fenêtre ~ proportionnelle à la résolution).
        const win = Math.max(21, Math.min(51, Math.round(Math.min(w, h) * 0.06)) | 1);
        const bin = sauvola(gray, w, h, win, 0.2);

        // Détection + recadrage du bloc de texte.
        const boxes = detectLines(bin, w, h);
        let crop: Box = { x: 0, y: 0, w, h };
        if (boxes.length > 0) {
            let xMin = w, yMin = h, xMax = 0, yMax = 0;
            for (const b of boxes) {
                xMin = Math.min(xMin, b.x); yMin = Math.min(yMin, b.y);
                xMax = Math.max(xMax, b.x + b.w); yMax = Math.max(yMax, b.y + b.h);
            }
            const padX = Math.round(w * 0.02), padY = Math.round(h * 0.02);
            crop = {
                x: Math.max(0, xMin - padX),
                y: Math.max(0, yMin - padY),
                w: Math.min(w, xMax + padX) - Math.max(0, xMin - padX),
                h: Math.min(h, yMax + padY) - Math.max(0, yMin - padY),
            };
        }

        // Canvas de sortie = recadrage BINARISÉ (Sauvola). Sur cartes brillantes,
        // le seuillage local bat la binarisation globale de Tesseract (reflets).
        const out = document.createElement('canvas');
        out.width = crop.w; out.height = crop.h;
        const octx = out.getContext('2d')!;
        const oimg = octx.createImageData(crop.w, crop.h);
        for (let y = 0; y < crop.h; y++) {
            for (let x = 0; x < crop.w; x++) {
                const v = bin[(crop.y + y) * w + (crop.x + x)];
                const o = (y * crop.w + x) * 4;
                oimg.data[o] = oimg.data[o + 1] = oimg.data[o + 2] = v;
                oimg.data[o + 3] = 255;
            }
        }
        octx.putImageData(oimg, 0, 0);
        if (out.width < 8 || out.height < 8) {
            return { canvas: enhanceForOCR(source, roi, scale, 1.5), boxes: [] };
        }

        // Boîtes de lignes en coordonnées vidéo (pour l'overlay caméra).
        const videoBoxes: DetectedBox[] = boxes.map((b) => ({
            x: roi.x + b.x / scale,
            y: roi.y + b.y / scale,
            w: b.w / scale,
            h: b.h / scale,
        }));
        return { canvas: out, boxes: videoBoxes };
    } catch {
        return { canvas: enhanceForOCR(source, roi, scale, 1.5), boxes: [] };
    }
}
