const BASE = '/api/local';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, init);
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<T>;
}

export const localApi = {
    get: <T>(path: string) => apiFetch<T>(path),
    post: <T>(path: string, body: unknown) =>
        apiFetch<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (path: string) => apiFetch<{ ok: boolean }>(path, { method: 'DELETE' }),
};
