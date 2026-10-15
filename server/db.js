import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'smart-docs.db');
const DATABASE_URL = process.env.DATABASE_URL;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getPostgresPool() {
  if (!DATABASE_URL) return null;
  return new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.RENDER ? { rejectUnauthorized: false } : false,
  });
}

async function ensurePostgresSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      office TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      last_login TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      office TEXT NOT NULL,
      payroll_voucher TEXT NOT NULL,
      particulars TEXT NOT NULL,
      fund TEXT NOT NULL,
      amount REAL NOT NULL,
      signature TEXT NOT NULL,
      date_forwarded TEXT NOT NULL,
      status TEXT NOT NULL,
      cheque_no TEXT,
      date_returned TEXT,
      pr_number TEXT,
      sub_type TEXT,
      qr_generated INTEGER NOT NULL DEFAULT 0,
      flag_reason TEXT,
      flag_by TEXT,
      flag_at TEXT,
      previous_status TEXT
    );

    CREATE TABLE IF NOT EXISTS tracking (
      id TEXT PRIMARY KEY,
      control_no TEXT NOT NULL,
      particulars TEXT NOT NULL,
      type TEXT NOT NULL,
      initiated_at TEXT NOT NULL,
      cto_received TEXT,
      cto_received_by TEXT,
      cto_for_sig TEXT,
      cto_forwarded TEXT,
      cto_forwarded_to TEXT,
      cto_forwarded_by TEXT,
      cbo_received TEXT,
      cbo_received_by TEXT,
      cbo_for_sig TEXT,
      cbo_forwarded TEXT,
      cbo_forwarded_to TEXT,
      cbo_forwarded_by TEXT,
      cao_received TEXT,
      cao_received_by TEXT,
      cao_for_sig TEXT,
      cao_forwarded TEXT,
      cao_forwarded_to TEXT,
      cao_forwarded_by TEXT,
      ca_return_received TEXT,
      ca_return_received_by TEXT,
      flagged INTEGER NOT NULL DEFAULT 0
    );
  `);


}

export function initializeDatabase(dbPath = DEFAULT_DB_PATH) {
  const pool = getPostgresPool();
  if (pool) {
    const state = { kind: 'postgres', pool, ready: ensurePostgresSchema(pool), close: () => pool.end() };
    return state;
  }

  ensureDir(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      office TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      office TEXT NOT NULL,
      payroll_voucher TEXT NOT NULL,
      particulars TEXT NOT NULL,
      fund TEXT NOT NULL,
      amount REAL NOT NULL,
      signature TEXT NOT NULL,
      date_forwarded TEXT NOT NULL,
      status TEXT NOT NULL,
      cheque_no TEXT,
      date_returned TEXT,
      pr_number TEXT,
      sub_type TEXT,
      qr_generated INTEGER NOT NULL DEFAULT 0,
      flag_reason TEXT,
      flag_by TEXT,
      flag_at TEXT,
      previous_status TEXT
    );

    CREATE TABLE IF NOT EXISTS tracking (
      id TEXT PRIMARY KEY,
      control_no TEXT NOT NULL,
      particulars TEXT NOT NULL,
      type TEXT NOT NULL,
      initiated_at TEXT NOT NULL,
      cto_received TEXT,
      cto_received_by TEXT,
      cto_for_sig TEXT,
      cto_forwarded TEXT,
      cto_forwarded_to TEXT,
      cto_forwarded_by TEXT,
      cbo_received TEXT,
      cbo_received_by TEXT,
      cbo_for_sig TEXT,
      cbo_forwarded TEXT,
      cbo_forwarded_to TEXT,
      cbo_forwarded_by TEXT,
      cao_received TEXT,
      cao_received_by TEXT,
      cao_for_sig TEXT,
      cao_forwarded TEXT,
      cao_forwarded_to TEXT,
      cao_forwarded_by TEXT,
      ca_return_received TEXT,
      ca_return_received_by TEXT,
      flagged INTEGER NOT NULL DEFAULT 0
    );
  `);



  return { kind: 'sqlite', db, ready: Promise.resolve(), close: () => db.close() };
}

function normalizeDocsRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    type: row.type,
    office: row.office,
    payrollVoucher: row.payroll_voucher ?? row.payrollvoucher,
    particulars: row.particulars,
    fund: row.fund,
    amount: Number(row.amount),
    signature: row.signature,
    dateForwarded: row.date_forwarded ?? row.dateforwarded,
    status: row.status,
    chequeNo: row.cheque_no || undefined,
    dateReturned: row.date_returned || undefined,
    prNumber: row.pr_number || undefined,
    subType: row.sub_type || undefined,
    qrGenerated: Boolean(row.qr_generated),
    flagData: row.flag_reason ? {
      reason: row.flag_reason,
      flaggedBy: row.flag_by,
      flaggedAt: row.flag_at,
    } : undefined,
    previousStatus: row.previous_status || undefined,
  }));
}

export function getDocs(db) {
  if (db.kind === 'postgres') {
    return db.ready.then(async () => {
      const result = await db.pool.query('SELECT * FROM documents ORDER BY date DESC, id DESC');
      return normalizeDocsRows(result.rows);
    });
  }

  const rows = db.db.prepare('SELECT * FROM documents ORDER BY date DESC, id DESC').all();
  return normalizeDocsRows(rows);
}

function normalizeTrackingRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    controlNo: row.control_no,
    particulars: row.particulars,
    type: row.type,
    initiatedAt: row.initiated_at,
    cto: row.cto_received || row.cto_for_sig || row.cto_forwarded ? {
      received: row.cto_received || undefined,
      receivedBy: row.cto_received_by || undefined,
      forSig: row.cto_for_sig || undefined,
      forwarded: row.cto_forwarded || undefined,
      forwardedTo: row.cto_forwarded_to || undefined,
      forwardedBy: row.cto_forwarded_by || undefined,
    } : undefined,
    cbo: row.cbo_received || row.cbo_for_sig || row.cbo_forwarded ? {
      received: row.cbo_received || undefined,
      receivedBy: row.cbo_received_by || undefined,
      forSig: row.cbo_for_sig || undefined,
      forwarded: row.cbo_forwarded || undefined,
      forwardedTo: row.cbo_forwarded_to || undefined,
      forwardedBy: row.cbo_forwarded_by || undefined,
    } : undefined,
    cao: row.cao_received || row.cao_for_sig || row.cao_forwarded ? {
      received: row.cao_received || undefined,
      receivedBy: row.cao_received_by || undefined,
      forSig: row.cao_for_sig || undefined,
      forwarded: row.cao_forwarded || undefined,
      forwardedTo: row.cao_forwarded_to || undefined,
      forwardedBy: row.cao_forwarded_by || undefined,
    } : undefined,
    caReturn: row.ca_return_received ? {
      received: row.ca_return_received || undefined,
      receivedBy: row.ca_return_received_by || undefined,
    } : undefined,
    flagged: Boolean(row.flagged),
  }));
}

export function getTracking(db) {
  if (db.kind === 'postgres') {
    return db.ready.then(async () => {
      const result = await db.pool.query('SELECT * FROM tracking ORDER BY initiated_at DESC');
      return normalizeTrackingRows(result.rows);
    });
  }

  const rows = db.db.prepare('SELECT * FROM tracking ORDER BY initiated_at DESC').all();
  return normalizeTrackingRows(rows);
}

export function createUser(db, payload) {
  if (db.kind === 'postgres') {
    return db.ready.then(async () => {
      const result = await db.pool.query(
        'INSERT INTO users (full_name, email, password_hash, role, office, status, last_login) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, full_name AS "fullName", email, role, office, status, last_login AS "lastLogin"',
        [payload.fullName, payload.email, payload.passwordHash, payload.role, payload.office || 'CHO', payload.status || 'Active', payload.lastLogin || null]
      );
      const row = result.rows[0];
      return { id: row.id, fullName: row.fullName, email: row.email, role: row.role, office: row.office, status: row.status, lastLogin: row.lastLogin };
    });
  }

  const stmt = db.db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, office, status, last_login)
    VALUES (@fullName, @email, @passwordHash, @role, @office, @status, @lastLogin)
  `);

  const row = stmt.run({
    fullName: payload.fullName,
    email: payload.email,
    passwordHash: payload.passwordHash,
    role: payload.role,
    office: payload.office || 'CHO',
    status: payload.status || 'Active',
    lastLogin: payload.lastLogin || null,
  });

  return {
    id: row.lastInsertRowid,
    fullName: payload.fullName,
    email: payload.email,
    role: payload.role,
    office: payload.office || 'CHO',
    status: payload.status || 'Active',
    lastLogin: payload.lastLogin || null,
  };
}

export function getUserByEmail(db, email) {
  if (db.kind === 'postgres') {
    return db.ready.then(async () => {
      const result = await db.pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    });
  }

  return db.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export { DEFAULT_DB_PATH };
