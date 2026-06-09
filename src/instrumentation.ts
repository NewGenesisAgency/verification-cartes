/**
 * Correctif SSR : sous Node 22+, l'option `--localstorage-file` (passée sans
 * chemin valide par l'environnement) installe un `localStorage` global EXPÉRIMENTAL
 * et CASSÉ dont les méthodes lèvent « localStorage.getItem is not a function ».
 * Toute lecture de `localStorage` pendant le rendu serveur plante alors.
 *
 * On remplace ce global cassé par un Storage en mémoire (no-op persistant le
 * temps du process) UNIQUEMENT côté serveur Node. Le navigateur n'est pas touché.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const g = globalThis as typeof globalThis & { localStorage?: Storage };

    // Déjà un Storage fonctionnel ? on ne touche à rien.
    if (g.localStorage && typeof g.localStorage.getItem === 'function') return;

    const store = new Map<string, string>();
    const shim: Storage = {
        get length() { return store.size; },
        clear() { store.clear(); },
        getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
        key(index: number) { return Array.from(store.keys())[index] ?? null; },
        removeItem(key: string) { store.delete(key); },
        setItem(key: string, value: string) { store.set(key, String(value)); },
    };

    try {
        g.localStorage = shim;
    } catch {
        try {
            Object.defineProperty(globalThis, 'localStorage', {
                value: shim,
                configurable: true,
                writable: true,
            });
        } catch {
            // impossible de remplacer le global : on laisse tel quel
        }
    }
}
