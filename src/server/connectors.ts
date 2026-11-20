import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { DbEngine, type DataSourceRecord, type TableAllowlistItem } from '../core/types.ts';
import { decryptSecret } from '../core/crypto.ts';
import { discoverDemoSchema, executeDemoReadOnlyQuery } from './demoAnalyticsDb.ts';

export interface QueryExecutionOutput {
  columns: string[];
  rows: Record<string, unknown>[];
  executionMs: number;
}

export async function testDataSourceConnection(
  source: DataSourceRecord
): Promise<{ ok: boolean; latencyMs: number; message: string; serverVersion?: string }> {
  const started = performance.now();

  if (source.engine === DbEngine.DEMO_WAREHOUSE) {
    executeDemoReadOnlyQuery('SELECT COUNT(*) AS total_factures FROM invoices LIMIT 1');
    return {
      ok: true,
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      message: 'Connexion en lecture seule validée (Entrepôt analytique démo chiffré).',
      serverVersion: 'SQLite 3 (Mode Lecture Seule)',
    };
  }

  const password = source.encryptedPassword ? decryptSecret(source.encryptedPassword) : '';

  if (source.engine === DbEngine.POSTGRESQL) {
    const client = new PgClient({
      host: source.host,
      port: source.port || 5432,
      database: source.databaseName,
      user: source.username,
      password,
      ssl:
        source.tlsMode === 'verify-full'
          ? { rejectUnauthorized: true }
          : { rejectUnauthorized: false },
      connectionTimeoutMillis: Math.min(source.timeoutMs || 5000, 8000),
      statement_timeout: Math.min(source.timeoutMs || 5000, 10000),
    });
    try {
      await client.connect();
      const versionRes = await client.query('SELECT version() AS v');
      return {
        ok: true,
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        message: 'Connexion PostgreSQL TLS établie en lecture seule.',
        serverVersion: String(versionRes.rows[0]?.v || 'PostgreSQL').slice(0, 64),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion PostgreSQL';
      return {
        ok: false,
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        message: `Échec de connexion PostgreSQL : ${msg}`,
      };
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (source.engine === DbEngine.MYSQL) {
    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection({
        host: source.host,
        port: source.port || 3306,
        database: source.databaseName,
        user: source.username,
        password,
        ssl: { rejectUnauthorized: source.tlsMode === 'verify-full' },
        connectTimeout: Math.min(source.timeoutMs || 5000, 8000),
      });
      const [rows] = await conn.query('SELECT VERSION() AS v');
      const versionRow = Array.isArray(rows) ? (rows[0] as { v?: string }) : undefined;
      return {
        ok: true,
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        message: 'Connexion MySQL TLS établie en lecture seule.',
        serverVersion: `MySQL ${versionRow?.v || ''}`.trim(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion MySQL';
      return {
        ok: false,
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        message: `Échec de connexion MySQL : ${msg}`,
      };
    } finally {
      if (conn) await conn.end().catch(() => {});
    }
  }

  return { ok: false, latencyMs: 0, message: 'Moteur de base de données non pris en charge.' };
}

export async function discoverDataSourceSchema(source: DataSourceRecord): Promise<TableAllowlistItem[]> {
  if (source.engine === DbEngine.DEMO_WAREHOUSE) {
    return discoverDemoSchema();
  }

  const password = source.encryptedPassword ? decryptSecret(source.encryptedPassword) : '';

  if (source.engine === DbEngine.POSTGRESQL) {
    const client = new PgClient({
      host: source.host,
      port: source.port || 5432,
      database: source.databaseName,
      user: source.username,
      password,
      ssl: { rejectUnauthorized: source.tlsMode === 'verify-full' },
      connectionTimeoutMillis: 6000,
    });
    try {
      await client.connect();
      const res = await client.query(
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`
      );
      const map = new Map<string, TableAllowlistItem>();
      for (const row of res.rows as Array<{ table_name: string; column_name: string; data_type: string }>) {
        if (!map.has(row.table_name)) {
          const sensitiveTable = /secret|password|credential|token/i.test(row.table_name);
          map.set(row.table_name, {
            name: row.table_name,
            allowed: !sensitiveTable,
            columns: [],
          });
        }
        const sensitiveCol = /iban|password|secret|token|hash|ssn/i.test(row.column_name);
        map.get(row.table_name)!.columns.push({
          name: row.column_name,
          type: row.data_type.toUpperCase(),
          allowed: !sensitiveCol,
          sensitive: sensitiveCol,
        });
      }
      return Array.from(map.values());
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (source.engine === DbEngine.MYSQL) {
    const conn = await mysql.createConnection({
      host: source.host,
      port: source.port || 3306,
      database: source.databaseName,
      user: source.username,
      password,
      ssl: { rejectUnauthorized: source.tlsMode === 'verify-full' },
      connectTimeout: 6000,
    });
    try {
      const [rows] = await conn.query(
        `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
         FROM information_schema.columns
         WHERE table_schema = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [source.databaseName]
      );
      const map = new Map<string, TableAllowlistItem>();
      for (const row of rows as Array<{ table_name: string; column_name: string; data_type: string }>) {
        if (!map.has(row.table_name)) {
          const sensitiveTable = /secret|password|credential|token/i.test(row.table_name);
          map.set(row.table_name, {
            name: row.table_name,
            allowed: !sensitiveTable,
            columns: [],
          });
        }
        const sensitiveCol = /iban|password|secret|token|hash|ssn/i.test(row.column_name);
        map.get(row.table_name)!.columns.push({
          name: row.column_name,
          type: row.data_type.toUpperCase(),
          allowed: !sensitiveCol,
          sensitive: sensitiveCol,
        });
      }
      return Array.from(map.values());
    } finally {
      await conn.end().catch(() => {});
    }
  }

  return [];
}

export async function executeReadOnlyQuery(
  source: DataSourceRecord,
  sanitizedSql: string
): Promise<QueryExecutionOutput> {
  if (source.engine === DbEngine.DEMO_WAREHOUSE) {
    return executeDemoReadOnlyQuery(sanitizedSql);
  }

  const started = performance.now();
  const password = source.encryptedPassword ? decryptSecret(source.encryptedPassword) : '';

  if (source.engine === DbEngine.POSTGRESQL) {
    const client = new PgClient({
      host: source.host,
      port: source.port || 5432,
      database: source.databaseName,
      user: source.username,
      password,
      ssl: { rejectUnauthorized: source.tlsMode === 'verify-full' },
      connectionTimeoutMillis: 6000,
      statement_timeout: source.timeoutMs || 5000,
    });
    try {
      await client.connect();
      await client.query('BEGIN TRANSACTION READ ONLY');
      const result = await client.query(sanitizedSql);
      await client.query('COMMIT');
      const rows = result.rows as Record<string, unknown>[];
      const columns = result.fields.map((f) => f.name);
      return {
        columns,
        rows,
        executionMs: Math.max(1, Math.round(performance.now() - started)),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (source.engine === DbEngine.MYSQL) {
    const conn = await mysql.createConnection({
      host: source.host,
      port: source.port || 3306,
      database: source.databaseName,
      user: source.username,
      password,
      ssl: { rejectUnauthorized: source.tlsMode === 'verify-full' },
      connectTimeout: 6000,
    });
    try {
      await conn.query('SET SESSION TRANSACTION READ ONLY');
      const [rows, fields] = await conn.query({
        sql: sanitizedSql,
        timeout: source.timeoutMs || 5000,
      });
      const dataRows = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
      const columns = Array.isArray(fields) ? fields.map((f) => f.name) : [];
      return {
        columns,
        rows: dataRows,
        executionMs: Math.max(1, Math.round(performance.now() - started)),
      };
    } finally {
      await conn.end().catch(() => {});
    }
  }

  throw new Error('Connecteur non pris en charge.');
}
