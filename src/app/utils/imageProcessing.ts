/**
 * Traitement d'image pour le scan (ROI + amélioration OCR).
 *
 * Centralise la logique d'amélioration d'image qui était dupliquée dans la page
 * de vérification, et ajoute le découpage d'une région d'intérêt (ROI) centrée
 * sur le cadre de visée : on n'analyse plus toute l'image mais la zone où
 * l'utilisateur présente naturellement sa carte → plus rapide et plus précis.
 */

export interface ROI {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Calcule une région d'intérêt carrée et centrée, occupant `ratio` de la plus
 * petite dimension. Sur une vidéo 16:9 cela retire les bandes latérales et se
 * concentre là où la carte est présentée.
 */
export function computeCenteredROI(width: number, height: number, ratio = 0.85): ROI {
    const size = Math.round(Math.min(width, height) * ratio);
    return {
        x: Math.round((width - size) / 2),
        y: Math.round((height - size) / 2),
        width: size,
        height: size,
    };
}

/**
 * Découpe la ROI d'une source vidéo dans un canvas (résolution native, sans
 * amélioration). Idéal pour la détection QR qui doit rester rapide.
 */
export function cropROI(
    source: CanvasImageSource,
    roi: ROI,
    target?: HTMLCanvasElement,
): HTMLCanvasElement {
    const canvas = target ?? document.createElement('canvas');
    canvas.width = roi.width;
    canvas.height = roi.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
        ctx.drawImage(source, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
    }
    return canvas;
}

/**
 * Découpe la ROI ET améliore l'image pour l'OCR :
 *  - upscaling (×scale) pour donner plus de matière à Tesseract
 *  - niveaux de gris (l'OCR n'a pas besoin de la couleur)
 *  - augmentation du contraste
 *
 * Retourne un canvas prêt à être passé à `recognizeText`.
 */
export function enhanceForOCR(
    source: CanvasImageSource,
    roi: ROI,
    scale = 2,
    contrast = 1.5,
): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = roi.width * scale;
    canvas.height = roi.height * scale;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
        source,
        roi.x, roi.y, roi.width, roi.height,
        0, 0, canvas.width, canvas.height,
    );

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        // Niveaux de gris (luminance perçue)
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Contraste
        const value = Math.max(0, Math.min(255, factor * (gray - 128) + 128));
        data[i] = data[i + 1] = data[i + 2] = value;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

/**
 * Convertit un canvas en Blob PNG (utilitaire async).
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Échec de la conversion canvas → blob'));
        }, 'image/png', 1.0);
    });
}

/**
 * Échantillonne la ROI en une petite empreinte en niveaux de gris (`size`×`size`)
 * et calcule sa variance. Très bon marché — sert à :
 *  - la détection de présence (une zone vide/uniforme a une variance faible),
 *  - la détection de stabilité (en comparant deux empreintes via `frameDiff`).
 */
export function sampleROI(
    source: CanvasImageSource,
    roi: ROI,
    size = 32,
): { signature: Uint8ClampedArray; variance: number } {
    const empty = { signature: new Uint8ClampedArray(size * size), variance: 0 };
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return empty;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, roi.x, roi.y, roi.width, roi.height, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const gray = new Uint8ClampedArray(size * size);
    let sum = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        gray[j] = g;
        sum += g;
    }
    const mean = sum / gray.length;
    let varSum = 0;
    for (let j = 0; j < gray.length; j++) {
        const d = gray[j] - mean;
        varSum += d * d;
    }
    return { signature: gray, variance: varSum / gray.length };
}

/**
 * Différence moyenne normalisée (0–1) entre deux empreintes `sampleROI`.
 * Proche de 0 = image stable ; élevé = ça bouge (flou de mouvement probable).
 */
export function frameDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    if (a.length !== b.length || a.length === 0) return 1;
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return sum / (a.length * 255);
}
