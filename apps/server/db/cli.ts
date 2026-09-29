import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config';
import { createContext } from '../context';
import { createLogger } from '../logger';
import { createDatabase } from './database';
import { dropAll, migrate } from './migrations';

/**
 * npm run db:migrate  — apply pending migrations
 * npm run db:seed     — create the database (if needed) and seed the demo venue if it is empty
 * npm run db:reset    — DROP ALL TABLES, remove demo credentials, then migrate + seed again
 */
async function main() {
  const command = process.argv[2];
  const config = loadConfig();
  const logger = createLogger('info', false);
  if (command === 'migrate') {
    const db = await createDatabase({
      url: config.databaseUrl || undefined,
      dataDir: config.dataDir,
      ssl: config.databaseSsl,
      mongoUri: config.mongoUri,
      mongoDatabase: config.mongoDatabase,
      mongoImportPglite: config.mongoImportPglite,
    });
    const ran = await migrate(db);
    logger.info(ran.length ? `Applied migrations: ${ran.join(', ')}` : 'Database is up to date.');
    await db.close();
    return;
  }
  if (command === 'reset') {
    if (config.mode === 'production' && process.env.CONFIRM_RESET !== 'yes')
      throw new Error(
        'Refusing to reset a production database. Set CONFIRM_RESET=yes to override.',
      );
    const db = await createDatabase({
      url: config.databaseUrl || undefined,
      dataDir: config.dataDir,
      ssl: config.databaseSsl,
      mongoUri: config.mongoUri,
      mongoDatabase: config.mongoDatabase,
      mongoImportPglite: config.mongoImportPglite,
    });
    if (db.reset) await db.reset();
    else await dropAll(db);
    await db.close();
    for (const file of ['demo-access.txt'])
      fs.rmSync(path.resolve(config.dataDir, file), { force: true });
    logger.info('All tables dropped.');
  }
  if (command === 'seed' || command === 'reset') {
    const context = await createContext({ ...config, seedDemo: true }, logger);
    logger.info('Database ready.');
    await context.close();
    return;
  }
  throw new Error('Usage: tsx apps/server/db/cli.ts <migrate|seed|reset>');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
