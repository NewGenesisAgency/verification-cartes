/**
 * Logger conditionnel.
 * Active les logs uniquement en développement (ou via ?debug=1 dans l'URL).
 * Évite de polluer la console en production et de ralentir la boucle de scan.
 */

function computeDebug(): boolean {
    if (process.env.NODE_ENV !== 'production') return true;
    if (typeof window !== 'undefined') {
        return new URLSearchParams(window.location.search).has('debug');
    }
    return false;
}

export const DEBUG = computeDebug();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debugLog(...args: any[]): void {
    if (DEBUG) console.log(...args);
}
