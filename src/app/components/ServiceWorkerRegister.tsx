'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker (PWA) — en production uniquement, pour ne pas
 * interférer avec le rechargement à chaud en développement.
 */
export default function ServiceWorkerRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
    }, []);
    return null;
}
