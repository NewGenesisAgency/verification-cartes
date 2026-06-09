import type { MetadataRoute } from 'next';

/**
 * Manifeste PWA — mode kiosque pour la borne d'entrée.
 * Next sert ce fichier à /manifest.webmanifest et ajoute automatiquement
 * le <link rel="manifest">.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Lycée Edouard Branly — MDL',
        short_name: 'MDL Scan',
        description: 'Vérification des cartes étudiantes — Maison des Lycéens',
        start_url: '/verification-cartes',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
    };
}
