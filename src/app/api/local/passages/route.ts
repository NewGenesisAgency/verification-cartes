import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/localDb';

export async function GET() {
    const rows = getDb().prepare(
        'SELECT nom, prenom, classe, eligible, statut, source, borne, scanned_at FROM passages ORDER BY scanned_at DESC LIMIT 500'
    ).all() as { nom: string; prenom: string; classe: string; eligible: number; statut: string; source: string; borne: string; scanned_at: string }[];
    return NextResponse.json(
        rows.map((r) => ({ ...r, eligible: Boolean(r.eligible) }))
    );
}

export async function POST(req: Request) {
    const p = await req.json() as { nom: string; prenom: string; classe: string; eligible: boolean; statut: string; source: string; borne?: string; scanned_at?: string };
    getDb().prepare(
        'INSERT INTO passages (nom, prenom, classe, eligible, statut, source, borne, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(p.nom, p.prenom, p.classe, p.eligible ? 1 : 0, p.statut, p.source, p.borne ?? 'borne-1', p.scanned_at ?? new Date().toISOString());
    return NextResponse.json({ ok: true });
}

export async function DELETE() {
    getDb().prepare('DELETE FROM passages').run();
    return NextResponse.json({ ok: true });
}
