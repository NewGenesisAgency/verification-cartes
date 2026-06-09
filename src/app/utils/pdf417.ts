/**
 * Décodage du code-barres PDF417 (au dos des cartes Passe Région) via ZXing.
 * Retourne le texte décodé, ou null si rien n'est trouvé.
 */

import { PDF417Reader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } from '@zxing/library';

const reader = new PDF417Reader();

export function decodePDF417(imageData: ImageData): string | null {
    const { data, width, height } = imageData;
    const luminances = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        luminances[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    try {
        const source = new RGBLuminanceSource(luminances, width, height);
        const bitmap = new BinaryBitmap(new HybridBinarizer(source));
        const result = reader.decode(bitmap);
        const text = result.getText();
        return text ? text.trim() : null;
    } catch {
        // Aucun code PDF417 lisible dans l'image.
        return null;
    }
}
