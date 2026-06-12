import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/localDb';

export async function GET() {
    const db = getDb();
    const rows = db.prepare(
        'SELECT nom, prenom, classe, numero, eligible FROM students ORDER BY lower(nom), lower(prenom)'
    ).all() as { nom: string; prenom: string; classe: string; numero: string | null; eligible: number }[];
    return NextResponse.json(
        rows.map((r) => ({ nom: r.nom, prenom: r.prenom, classe: r.classe, numero: r.numero ?? '', eligible: r.eligible ? 'oui' : 'non' }))
    );
}

export async function POST(req: Request) {
    const { students } = await req.json() as { students: { nom: string; prenom: string; classe: string; numero?: string; eligible?: string }[] };
    const db = getDb();
    const del = db.prepare('DELETE FROM students');
    const ins = db.prepare('INSERT INTO students (nom, prenom, classe, numero, eligible) VALUES (?, ?, ?, ?, ?)');
    db.transaction(() => {
        del.run();
        for (const s of students) {
            ins.run(s.nom, s.prenom, s.classe, s.numero || null, (s.eligible || '').toLowerCase() === 'oui' ? 1 : 0);
        }
    })();
    return NextResponse.json({ ok: true, count: students.length });
}

export async function DELETE() {
    getDb().prepare('DELETE FROM students').run();
    return NextResponse.json({ ok: true });
}
