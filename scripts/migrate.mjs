// Runner migration berurutan dengan checksum dan histori deployment.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');
const lockName = 'backend_sdm:migrations';
const isBaseline = process.argv.includes('--baseline');
const isStatus = process.argv.includes('--status');

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

async function migrationFiles() {
  const names = (await fs.readdir(migrationDir))
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return Promise.all(names.map(async filename => {
    const sql = await fs.readFile(path.join(migrationDir, filename), 'utf8');
    return { filename, sql, checksum: checksum(sql) };
  }));
}

async function ensureHistoryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id_migration BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by TEXT NOT NULL DEFAULT CURRENT_USER,
      execution_ms INTEGER NOT NULL DEFAULT 0,
      applied_via TEXT NOT NULL DEFAULT 'runner' CHECK (applied_via IN ('runner', 'baseline'))
    );
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
      ON schema_migrations (applied_at DESC);
  `);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName]);
    await ensureHistoryTable(client);
    const files = await migrationFiles();
    const appliedResult = await client.query('SELECT filename, checksum, applied_at, applied_via FROM schema_migrations ORDER BY filename');
    const applied = new Map(appliedResult.rows.map(row => [row.filename, row]));

    if (isStatus) {
      for (const file of files) {
        const row = applied.get(file.filename);
        const state = !row ? 'PENDING' : row.checksum === file.checksum ? 'APPLIED' : 'DRIFT';
        console.log(`${state}\t${file.filename}${row ? `\t${row.applied_at.toISOString()}\t${row.applied_via}` : ''}`);
      }
      if ([...applied.keys()].some(filename => !files.some(file => file.filename === filename))) {
        console.log('ORPHANED\tHistory entry has no matching migration file');
      }
      return;
    }

    for (const file of files) {
      const row = applied.get(file.filename);
      if (row) {
        if (row.checksum !== file.checksum) throw new Error(`Checksum migration berubah: ${file.filename}`);
        console.log(`SKIP\t${file.filename}`);
        continue;
      }
      const started = Date.now();
      if (isBaseline) {
        await client.query(`INSERT INTO schema_migrations (filename, checksum, execution_ms, applied_via) VALUES ($1, $2, 0, 'baseline')`, [file.filename, file.checksum]);
        console.log(`BASELINE\t${file.filename}`);
        continue;
      }
      await client.query(file.sql);
      await client.query(`INSERT INTO schema_migrations (filename, checksum, execution_ms, applied_via) VALUES ($1, $2, $3, 'runner')`, [file.filename, file.checksum, Date.now() - started]);
      console.log(`APPLY\t${file.filename}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]).catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(`Migration gagal: ${error.message}`);
  process.exitCode = 1;
});
