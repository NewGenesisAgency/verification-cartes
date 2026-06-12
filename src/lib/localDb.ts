import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH  = path.join(DATA_DIR, 'mdl.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (_db) return _db;

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

    _db.exec(`
        CREATE TABLE IF NOT EXISTS students (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            nom       TEXT NOT NULL DEFAULT '',
            prenom    TEXT NOT NULL DEFAULT '',
            classe    TEXT NOT NULL DEFAULT '',
            numero    TEXT,
            eligible  INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_students_numero ON students(numero);
        CREATE INDEX IF NOT EXISTS idx_students_nom    ON students(lower(nom), lower(prenom));

        CREATE TABLE IF NOT EXISTS passages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            nom        TEXT NOT NULL DEFAULT '',
            prenom     TEXT NOT NULL DEFAULT '',
            classe     TEXT NOT NULL DEFAULT '',
            eligible   INTEGER NOT NULL DEFAULT 0,
            statut     TEXT NOT NULL DEFAULT '',
            source     TEXT NOT NULL DEFAULT '',
            borne      TEXT NOT NULL DEFAULT '',
            scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_passages_scanned ON passages(scanned_at DESC);

        CREATE TABLE IF NOT EXISTS incidents (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            type             TEXT NOT NULL CHECK(type IN ('blame','incident')),
            severity         INTEGER CHECK(severity BETWEEN 1 AND 3),
            student_qr       TEXT,
            nom              TEXT NOT NULL DEFAULT '',
            prenom           TEXT NOT NULL DEFAULT '',
            classe           TEXT NOT NULL DEFAULT '',
            description      TEXT NOT NULL DEFAULT '',
            created_by_email TEXT,
            created_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_incidents_type    ON incidents(type);
    `);

    return _db;
}
