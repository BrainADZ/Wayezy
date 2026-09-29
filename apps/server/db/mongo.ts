import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Binary, MongoClient, type AnyBulkWriteOperation, type Db, type Document } from 'mongodb';
import { createPglite, type Database, type Queryable } from './database';
import { allTables, migrate } from './migrations';

/**
 * MongoDB is the durable store. PGlite is an in-memory SQL compatibility layer for
 * the existing repositories; it does not create a second on-disk database.
 */
const dataTables = [
  ...allTables
    .slice()
    .reverse()
    .filter((table) => table !== 'schema_migrations'),
  'reference_map_imports',
];

type Row = Record<string, unknown>;
type Change = { id: number; table_name: string; operation: string; row_data: Row | string };
const trace = (step: string) => {
  if (process.env.MONGO_IMPORT_DEBUG === '1') console.error(`[mongo-import] ${step}`);
};

function documentId(table: string, row: Row) {
  if (table === 'settings') return `${row.venue_id}:${row.key}`;
  if (table === 'reference_map_imports') return String(row.venue_id);
  return String(row.id ?? row.version);
}

function collection(database: Db, table: string) {
  return database.collection<Document>(`rows_${table}`);
}

function storedDocument(table: string, row: Row): Document {
  const _id = documentId(table, row);
  const json = JSON.stringify(row);
  // Published maps and import backups can be larger than MongoDB's document limit.
  return Buffer.byteLength(json) > 8 * 1024 * 1024
    ? { _id, compressed: gzipSync(json) }
    : { _id, ...row };
}

function documentRow(record: Document): Row {
  if (record.compressed instanceof Binary)
    return JSON.parse(gunzipSync(record.compressed.buffer).toString('utf8')) as Row;
  const row = { ...record };
  delete row._id;
  return row;
}

async function rowsIfPresent(db: Database, table: string): Promise<Row[]> {
  try {
    return await db.query<Row>(`select * from ${table}`);
  } catch (error) {
    // reference_map_imports was added outside the numbered migrations.
    if (table === 'reference_map_imports') return [];
    throw error;
  }
}

async function importLegacyData(database: Db, dataDir: string) {
  const legacyPath = path.resolve(dataDir, 'pgdata');
  if (!fs.existsSync(legacyPath)) return false;
  trace('opening legacy database');
  const legacy = await createPglite(legacyPath);
  try {
    for (const table of dataTables) {
      trace(`reading ${table}`);
      const rows = await rowsIfPresent(legacy, table);
      if (!rows.length) continue;
      const target = collection(database, table);
      for (let offset = 0; offset < rows.length; offset += 500) {
        const operations: AnyBulkWriteOperation<Document>[] = rows
          .slice(offset, offset + 500)
          .map((row) => ({
            replaceOne: {
              filter: { _id: documentId(table, row) },
              replacement: storedDocument(table, row),
              upsert: true,
            },
          }));
        await target.bulkWrite(operations, { ordered: true });
      }
    }
    return true;
  } finally {
    await legacy.close();
  }
}

async function restoreTable(sql: Database, database: Db, table: string) {
  const records = (await collection(database, table).find().toArray()).map(documentRow);
  if (!records.length) return;
  const columns = await sql.query<{ column_name: string; udt_name: string }>(
    'select column_name, udt_name from information_schema.columns where table_name = $1 order by ordinal_position',
    [table],
  );
  if (!columns.length)
    throw new Error(`MongoDB contains ${table}, but the SQL compatibility schema does not.`);
  const names = columns.map((column) => column.column_name);
  const quoted = names.map((name) => `"${name}"`).join(', ');
  for (let offset = 0; offset < records.length; offset += 50) {
    const batch = records.slice(offset, offset + 50);
    const params: unknown[] = [];
    const values = batch.map((record) => {
      const placeholders = columns.map((column) => {
        const value = record[column.column_name];
        params.push(
          value == null ? null : column.udt_name === 'jsonb' ? JSON.stringify(value) : value,
        );
        return `$${params.length}${column.udt_name === 'jsonb' ? '::jsonb' : ''}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await sql.query(`insert into ${table} (${quoted}) values ${values.join(', ')}`, params);
  }
  if (['analytics_events', 'audit_log', 'device_heartbeats'].includes(table))
    await sql.query(
      `select setval(pg_get_serial_sequence('${table}', 'id'), (select max(id) from ${table}), true)`,
    );
}

async function installOutbox(sql: Database) {
  await sql.exec(`
    create table if not exists mongo_outbox (
      id bigserial primary key,
      table_name text not null,
      operation text not null,
      row_data jsonb not null
    );
    create or replace function mongo_capture_change() returns trigger language plpgsql as $$
    begin
      if TG_OP = 'DELETE' then
        insert into mongo_outbox (table_name, operation, row_data)
        values (TG_TABLE_NAME, TG_OP, to_jsonb(OLD));
        return OLD;
      end if;
      insert into mongo_outbox (table_name, operation, row_data)
      values (TG_TABLE_NAME, TG_OP, to_jsonb(NEW));
      return NEW;
    end;
    $$;
  `);
  for (const table of dataTables) {
    const exists = await sql.query<{ exists: string | null }>('select to_regclass($1) as exists', [
      table,
    ]);
    if (!exists[0]?.exists) continue;
    await sql.exec(`
      drop trigger if exists mongo_capture on ${table};
      create trigger mongo_capture after insert or update or delete on ${table}
      for each row execute function mongo_capture_change();
    `);
  }
}

async function flushOutbox(sql: Database, database: Db) {
  const changes = await sql.query<Change>('select * from mongo_outbox order by id');
  if (!changes.length) return;
  const byTable = new Map<string, AnyBulkWriteOperation<Document>[]>();
  for (const change of changes) {
    const row =
      typeof change.row_data === 'string' ? (JSON.parse(change.row_data) as Row) : change.row_data;
    const id = documentId(change.table_name, row);
    const operations = byTable.get(change.table_name) ?? [];
    operations.push(
      change.operation === 'DELETE'
        ? { deleteOne: { filter: { _id: id } } }
        : {
            replaceOne: {
              filter: { _id: id },
              replacement: storedDocument(change.table_name, row),
              upsert: true,
            },
          },
    );
    byTable.set(change.table_name, operations);
  }
  for (const [table, operations] of byTable)
    for (let offset = 0; offset < operations.length; offset += 500)
      await collection(database, table).bulkWrite(operations.slice(offset, offset + 500), {
        ordered: true,
      });
  await sql.query('delete from mongo_outbox where id <= $1', [changes.at(-1)!.id]);
}

export async function createMongoDatabase(options: {
  uri: string;
  databaseName: string;
  dataDir: string;
  importLegacy: boolean;
}): Promise<Database> {
  const client = new MongoClient(options.uri, { serverSelectionTimeoutMS: 5000 });
  let openedSql: Database | undefined;
  try {
    trace('connecting to MongoDB');
    await client.connect();
    const database = client.db(options.databaseName);
    const state = database.collection('app_state');
    const initialized = await state.findOne({ _id: 'database' });
    if (!initialized?.ready) {
      trace('importing legacy data');
      // Close the legacy PGlite instance before opening the in-memory one.
      const imported = options.importLegacy
        ? await importLegacyData(database, options.dataDir)
        : false;
      await state.updateOne(
        { _id: 'database' },
        {
          $set: {
            ready: true,
            source: imported ? 'legacy-pglite' : 'fresh',
            initializedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }
    trace('opening in-memory SQL engine');
    const sql = await createPglite();
    openedSql = sql;
    await migrate(sql);
    trace('restoring collections');
    await sql.exec(`create table if not exists reference_map_imports (
      venue_id text primary key,
      original_working jsonb not null,
      original_published jsonb not null,
      imported_at timestamptz not null default now()
    )`);
    for (const table of dataTables) await restoreTable(sql, database, table);
    trace('installing change capture');
    await installOutbox(sql);

    // A write is acknowledged only after the corresponding MongoDB operation succeeds.
    const write = /^\s*(insert|update|delete|truncate)\b/i;
    const adapter: Database = {
      kind: 'mongo',
      async query<T>(statement: string, params: unknown[] = []) {
        if (statement.trim().toLowerCase() === 'select 1') await database.command({ ping: 1 });
        const rows = await sql.query<T>(statement, params);
        if (write.test(statement)) await flushOutbox(sql, database);
        return rows;
      },
      async exec(statement: string) {
        await sql.exec(statement);
        await flushOutbox(sql, database);
      },
      async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
        const result = await sql.transaction(fn);
        await flushOutbox(sql, database);
        return result;
      },
      async reset() {
        await database.dropDatabase();
        await database
          .collection('app_state')
          .updateOne(
            { _id: 'database' },
            { $set: { ready: true, source: 'reset', initializedAt: new Date() } },
            { upsert: true },
          );
      },
      async close() {
        await sql.close();
        await client.close();
      },
    };
    return adapter;
  } catch (error) {
    await openedSql?.close();
    await client.close();
    throw error;
  }
}
