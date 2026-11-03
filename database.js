/**
 * Módulo de Base de Datos SQLite Nativo (Node.js 22+)
 * Persistencia ACID completa en ./data/katio.db
 * Sin usuarios demo ni datos precargados falsos (todo limpio).
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'katio.db');
const db = new DatabaseSync(DB_PATH);

// Configurar modo WAL para alto rendimiento y concurrencia
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Inicialización del Esquema Relacional
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    category_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    hours REAL DEFAULT 0,
    price REAL DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    consecutive TEXT UNIQUE NOT NULL,
    doc_type TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_nit TEXT,
    client_phone TEXT,
    client_email TEXT,
    client_address TEXT,
    emission_date TEXT NOT NULL,
    validity_days INTEGER DEFAULT 15,
    complexity_percent REAL DEFAULT 0,
    apply_iva INTEGER DEFAULT 0,
    subtotal REAL NOT NULL,
    iva_value REAL DEFAULT 0,
    total REAL NOT NULL,
    items_json TEXT NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'Borrador',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    consecutive TEXT UNIQUE NOT NULL,
    doc_type TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_nit TEXT,
    client_phone TEXT,
    client_email TEXT,
    client_address TEXT,
    emission_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    complexity_percent REAL DEFAULT 0,
    apply_iva INTEGER DEFAULT 0,
    subtotal REAL NOT NULL,
    iva_value REAL DEFAULT 0,
    total REAL NOT NULL,
    items_json TEXT NOT NULL,
    payment_method TEXT DEFAULT 'Nequi / Bre-B / Transferencia',
    notes TEXT,
    status TEXT DEFAULT 'Pendiente',
    quote_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Configuración inicial por defecto del emisor (sin usuarios demo)
const initialSettings = {
  company_name: 'Katio Design',
  emisor_name: 'Mauricio Luis Cavadias Sepúlveda',
  emisor_nit: '1.003.061.562-1',
  emisor_regimen: 'Persona natural · No responsable de IVA',
  emisor_phone: '3045380714',
  emisor_city: 'Montería, Córdoba',
  emisor_email: 'kattioshop@gmail.com',
  bank_nequi: '3045380714',
  bank_breb: '@3045380714',
  default_iva_enabled: '0',
  income: '3000000',
  expenses: '500000',
  reserve: '10',
  hours: '80',
  quote_seq: '1',
  invoice_seq: '1',
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: '0',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: 'Katio Design <kattioshop@gmail.com>'
};

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

for (const [key, val] of Object.entries(initialSettings)) {
  const existing = getSettingStmt.get(key);
  if (!existing) {
    setSettingStmt.run(key, val);
  }
}

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass).digest('hex');
}

module.exports = {
  db,
  hashPassword,
  getSetting(key) {
    const row = getSettingStmt.get(key);
    return row ? row.value : null;
  },
  setSetting(key, value) {
    setSettingStmt.run(key, String(value));
  },
  getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    return settings;
  }
};
