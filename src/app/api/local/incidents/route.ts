import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/localDb';

export async function GET() {
    const rows = getDb().prepare(
        'SELECT id, type, severity, student_qr, nom, prenom, classe, description, created_by_email, created_at FROM incidents ORDER BY created_at DESC'
    ).all();
    return NextResponse.json(rows);
}

export async function POST(req: Request) {
    const i = await req.json() as { type: string; severity?: number; student_qr?: string; nom: string; prenom: string; classe: string; description: string };
    const result = getDb().prepare(
        'INSERT INTO incidents (type, severity, student_qr, nom, prenom, classe, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(i.type, i.severity ?? null, i.student_qr ?? null, i.nom, i.prenom, i.classe, i.description);
    return NextResponse.json({ ok: true, id: result.lastInsertRowid });
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    getDb().prepare('DELETE FROM incidents WHERE id = ?').run(id);
    return NextResponse.json({ ok: true });
}
