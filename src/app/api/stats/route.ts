import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'stats.json');

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
        return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const newEntry = await request.json();
        await ensureDataFile();
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        const stats = JSON.parse(data);
        stats.push(newEntry);
        await fs.writeFile(DATA_FILE, JSON.stringify(stats, null, 2), 'utf-8');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to save stat' }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        await ensureDataFile();
        await fs.writeFile(DATA_FILE, JSON.stringify([]), 'utf-8');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to clear stats' }, { status: 500 });
    }
}
