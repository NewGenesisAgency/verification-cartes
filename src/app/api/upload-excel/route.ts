import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const EXCEL_FILE = path.join(process.cwd(), 'public', 'data', 'database.xlsx');

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        await fs.mkdir(path.dirname(EXCEL_FILE), { recursive: true });
        await fs.writeFile(EXCEL_FILE, buffer);

        return NextResponse.json({ success: true, message: 'File uploaded successfully' });
    } catch {
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
}
