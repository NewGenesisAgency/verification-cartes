import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'students.json');

async function ensureDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.writeFile(DATA_FILE, JSON.stringify([]), 'utf-8');
    }
}

export async function GET() {
    try {
        await ensureDataFile();
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch {
        return NextResponse.json({ error: 'Failed to load students' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const students = await request.json();
        await ensureDataFile();
        await fs.writeFile(DATA_FILE, JSON.stringify(students, null, 2), 'utf-8');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to save students' }, { status: 500 });
    }
}
