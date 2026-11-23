// Database access. Uses Postgres (e.g. Supabase) when DATABASE_URL is set,
// otherwise an embedded Postgres (PGlite) stored on disk for local development.
import { SCHEMA } from './schema';
import { configStale, applyStoredConfig } from './config';

const g = globalThis;

async function connect() {
  let db;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5,
    });
    db = {
      query: async (text, params = []) => (await pool.query(text, params)).rows,
      exec: async (text) => { await pool.query(text); },
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || './.data/pglite';
    const { mkdirSync } = await import('fs');
    mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    await pg.waitReady;
    db = {
      query: async (text, params = []) => (await pg.query(text, params)).rows,
      exec: async (text) => { await pg.exec(text); },
    };
  }
  await db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!g.__avastarsDb) g.__avastarsDb = connect().catch((e) => { g.__avastarsDb = null; throw e; });
  return g.__avastarsDb;
}

/** Run a query and return all rows. */
export async function q(text, params = []) {
  const db = await getDb();
  if (configStale()) await reloadConfig(db);
  return db.query(text, params);
}

/** Loads admin-edited keys (Settings → Keys & connections) into memory; refreshed at most every 30 s. */
export async function reloadConfig(db) {
  try {
    const conn = db || (await getDb());
    const rows = await conn.query("SELECT value FROM settings WHERE key = 'app_config'");
    applyStoredConfig(rows[0]?.value || {});
  } catch { applyStoredConfig({}); }
}

/** Run a query and return the first row (or null). */
export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

/** JSON helper for JSONB parameters. */
export const j = (v) => JSON.stringify(v ?? null);

export async function getSetting(key, fallback) {
  const row = await one('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await q('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, j(value)]);
}

export async function logActivity(candidateId, applicationId, text) {
  await q('INSERT INTO activities (candidate_id, application_id, text) VALUES ($1, $2, $3)', [candidateId, applicationId || null, text]);
}
