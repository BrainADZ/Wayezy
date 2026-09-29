import fs from 'node:fs';
import path from 'node:path';

/**
 * Database boundary. Production uses managed PostgreSQL (e.g. Supabase) through `pg`;
 * local demo and tests use embedded PostgreSQL (PGlite) so no server install is required.
 * Both speak the same SQL, so migrations and repositories are shared.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  kind: 'postgres' | 'pglite' | 'mongo';
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  reset?(): Promise<void>;
}

export async function createDatabase(options: {
  url?: string;
  dataDir?: string;
  ssl?: boolean;
  memory?: boolean;
  mongoUri?: string;
  mongoDatabase?: string;
  mongoImportPglite?: boolean;
}): Promise<Database> {
  if (options.mongoUri) {
    const { createMongoDatabase } = await import('./mongo');
    return createMongoDatabase({
      uri: options.mongoUri,
      databaseName: options.mongoDatabase ?? 'wayezy',
      dataDir: options.dataDir ?? '.data',
      importLegacy: options.mongoImportPglite ?? false,
    });
  }
  if (options.url) return createPostgres(options.url, options.ssl ?? false);
  return createPglite(
    options.memory ? undefined : path.resolve(options.dataDir ?? '.data', 'pgdata'),
  );
}

async function createPostgres(url: string, ssl: boolean): Promise<Database> {
  const { default: pg } = await import('pg');
  // Keep int8 counts as JS numbers (analytics counts are well below 2^53).
  pg.types.setTypeParser(20, (value: string) => Number(value));
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query('select 1');
  return {
    kind: 'postgres',
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const value = await fn({
          async query<R>(sql: string, params: unknown[] = []) {
            return (await client.query(sql, params as unknown[])).rows as R[];
          },
        });
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function createPglite(dir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  const normaliseRows = <T>(rows: unknown[]) =>
    rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row as Record<string, unknown>))
        out[key] = typeof value === 'bigint' ? Number(value) : value;
      return out as T;
    });
  return {
    kind: 'pglite',
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await db.query(sql, params);
      return normaliseRows<T>(result.rows);
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return db.transaction(async (tx) =>
        fn({
          async query<R>(sql: string, params: unknown[] = []) {
            return normaliseRows<R>((await tx.query(sql, params)).rows);
          },
        }),
      );
    },
    close: () => db.close(),
  };
}
