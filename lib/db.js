import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// Em serverless o módulo é reaproveitado entre invocações; guardar o pool no
// globalThis evita abrir uma conexão nova a cada request (e estourar o limite
// de conexões do Postgres do Railway).
const globalForPg = globalThis;

function makePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não configurada');
  return new Pool({
    connectionString,
    // O Postgres do Railway usa TLS com certificado próprio.
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
  });
}

export function pool() {
  if (!globalForPg._meterPool) globalForPg._meterPool = makePool();
  return globalForPg._meterPool;
}

export async function query(text, params) {
  return pool().query(text, params);
}

/** Cria as tabelas na primeira chamada. Idempotente e barato depois disso. */
export async function ensureSchema() {
  if (globalForPg._meterSchemaReady) return;
  const sql = fs.readFileSync(path.join(process.cwd(), 'lib', 'schema.sql'), 'utf8');
  await pool().query(sql);
  globalForPg._meterSchemaReady = true;
}
