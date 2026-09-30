import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from './config';
import { createDatabase, type Database } from './db/database';
import { migrate } from './db/migrations';
import { seedDemo, syncDemoAccessAdmin, writeDemoAccessFile } from './db/seed';
import type { Logger } from './logger';
import { AnalyticsRepository } from './repositories/analytics';
import { AuditRepository } from './repositories/audit';
import { ContentRepository } from './repositories/content';
import { DeviceRepository } from './repositories/devices';
import { SettingsRepository } from './repositories/settings';
import { SnapshotRepository } from './repositories/snapshots';
import { installReferenceMap } from './db/reference-map';
import { installGroundRoutes } from './db/ground-routes';
import { installGroundDirectory } from './db/ground-directory';
import { UserRepository } from './repositories/users';
import { generatePassword, verifyPassword } from './services/passwords';
import { RealtimeHub } from './services/realtime';
import {
  createLocalStorage,
  createSupabaseStorage,
  type StorageProvider,
} from './services/storage';

export const APP_VERSION = '1.0.0';

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  db: Database;
  storage: StorageProvider;
  realtime: RealtimeHub;
  content: ContentRepository;
  snapshots: SnapshotRepository;
  users: UserRepository;
  audit: AuditRepository;
  analytics: AnalyticsRepository;
  devices: DeviceRepository;
  settings: SettingsRepository;
  routeTokenSecret: string;
  appVersion: string;
  lanBaseUrl: string | null;
  close(): Promise<void>;
}

function loadOrCreateSecret(config: AppConfig, memory: boolean) {
  if (config.routeTokenSecret) return config.routeTokenSecret;
  if (memory) return randomBytes(32).toString('base64url');
  const file = path.resolve(config.dataDir, 'secrets.json');
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as { routeTokenSecret?: string };
    if (stored.routeTokenSecret) return stored.routeTokenSecret;
  } catch {
    /* first run */
  }
  const secret = randomBytes(32).toString('base64url');
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ routeTokenSecret: secret }, null, 2), { mode: 0o600 });
  return secret;
}

/** First non-internal IPv4 address, so QR codes work on a phone on the same Wi-Fi during demos. */
export function detectLanBaseUrl(port: number) {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.'))
        return `http://${address.address}:${port}`;
    }
  }
  return null;
}

export async function createContext(
  config: AppConfig,
  logger: Logger,
  options: { memoryDatabase?: boolean; storage?: StorageProvider } = {},
): Promise<AppContext> {
  const memory = Boolean(options.memoryDatabase);
  const db = await createDatabase({
    url: config.databaseUrl || undefined,
    dataDir: config.dataDir,
    ssl: config.databaseSsl,
    memory,
    mongoUri: memory ? undefined : config.mongoUri,
    mongoDatabase: config.mongoDatabase,
    mongoImportPglite: config.mongoImportPglite,
  });
  const applied = await migrate(db);
  if (applied.length)
    logger.info('Database migrations applied', { migrations: applied, driver: db.kind });

  const storage =
    options.storage ??
    (config.storageDriver === 'supabase'
      ? createSupabaseStorage({
          url: config.supabaseUrl,
          serviceRoleKey: config.supabaseServiceRoleKey,
          bucket: config.supabaseBucket,
        })
      : createLocalStorage(config.dataDir));
  const venueId = config.venueId;
  const context: AppContext = {
    config,
    logger,
    db,
    storage,
    realtime: new RealtimeHub(),
    content: new ContentRepository(db, venueId),
    snapshots: new SnapshotRepository(db, venueId),
    users: new UserRepository(db, venueId),
    audit: new AuditRepository(db, venueId),
    analytics: new AnalyticsRepository(db, venueId),
    devices: new DeviceRepository(db, venueId),
    settings: new SettingsRepository(db, venueId),
    routeTokenSecret: loadOrCreateSecret(config, memory),
    appVersion: APP_VERSION,
    lanBaseUrl: config.isDemo ? detectLanBaseUrl(config.port) : null,
    async close() {
      context.realtime.close();
      await db.close();
    },
  };

  const venueRows = await db.query('select id from venues where id = $1', [venueId]);
  let deviceKeys: Record<string, string> = {};
  if (!venueRows.length) {
    if (!config.seedDemo)
      throw new Error(
        `Venue "${venueId}" does not exist. Run "npm run db:seed" or set SEED_DEMO=true.`,
      );
    const seeded = await seedDemo(context, { analytics: config.demoAnalytics });
    deviceKeys = seeded.deviceKeys;
    logger.info('Seeded demo venue', { venueId, tenants: seeded.tenants });
  }

  const firstUser = (await context.users.count()) === 0;
  if (config.adminPassword) {
    const configured = await context.users.findForLogin(config.adminEmail);
    if (configured) {
      if (configured.user.role !== 'SUPER_ADMIN' || !configured.user.active)
        throw new Error(
          `Cannot use ADMIN_EMAIL=${config.adminEmail}: the existing user is not an active Super Admin.`,
        );
      const passwordMatches = await verifyPassword(config.adminPassword, configured.passwordHash);
      if (!passwordMatches || configured.user.name !== config.adminName)
        await context.users.update(configured.user.id, {
          name: config.adminName,
          email: config.adminEmail,
          role: 'SUPER_ADMIN',
          active: true,
          password: passwordMatches ? undefined : config.adminPassword,
        });
    } else {
      const activeSuperAdmins = (await context.users.list()).filter(
        (user) => user.role === 'SUPER_ADMIN' && user.active,
      );
      if (activeSuperAdmins.length === 1)
        await context.users.update(activeSuperAdmins[0].id, {
          name: config.adminName,
          email: config.adminEmail,
          role: 'SUPER_ADMIN',
          active: true,
          password: config.adminPassword,
        });
    }
  }

  const needsConfiguredAdmin =
    Boolean(config.adminPassword) && !(await context.users.findForLogin(config.adminEmail));
  if (needsConfiguredAdmin || (await context.users.countActiveSuperAdmins()) === 0) {
    if (config.mode === 'production' && !config.adminPassword)
      throw new Error(
        'No active Super Admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) to create one.',
      );
    if (await context.users.findForLogin(config.adminEmail))
      throw new Error(
        `Cannot create Super Admin: ${config.adminEmail} is already used by a user. Choose a different ADMIN_EMAIL.`,
      );
    const adminPassword = config.adminPassword || generatePassword();
    await context.users.create({
      name: config.adminName,
      email: config.adminEmail,
      role: 'SUPER_ADMIN',
      password: adminPassword,
    });
    const demoAccounts: { email: string; role: string; password: string }[] = [];
    if (firstUser && config.demoUsers) {
      const roleUsers = [
        ['Maya Rao', 'mall.admin@wayezy.local', 'MALL_ADMIN'],
        ['Arjun Mehta', 'content@wayezy.local', 'CONTENT_MANAGER'],
        ['Priya Nair', 'ads@wayezy.local', 'ADVERTISING_MANAGER'],
        ['Kabir Shah', 'analyst@wayezy.local', 'ANALYST'],
        ['Deepa Iyer', 'devices@wayezy.local', 'DEVICE_OPERATOR'],
      ] as const;
      for (const [name, email, role] of roleUsers) {
        const password = generatePassword();
        await context.users.create({ name, email, role, password });
        demoAccounts.push({ email, role, password });
      }
    }
    if (!memory && config.isDemo) {
      const file = writeDemoAccessFile(config, {
        adminEmail: config.adminEmail,
        adminPassword,
        demoAccounts,
        deviceKeys,
        baseUrl: config.publicBaseUrl || context.lanBaseUrl || `http://localhost:${config.port}`,
      });
      logger.info(`Demo sign-in details written to ${file}`);
    } else if (!config.adminPassword) {
      logger.warn('Generated admin password (shown once)', {
        email: config.adminEmail,
        password: adminPassword,
      });
    }
  }
  if (!memory && config.isDemo && config.adminPassword)
    syncDemoAccessAdmin(config, config.adminEmail);
  if (!(await context.snapshots.latest()))
    await context.snapshots.publish(context.content, 'system', 'Initial publish');
  await installReferenceMap(context);
  await installGroundRoutes(context);
  await installGroundDirectory(context);
  await context.users.purgeExpiredSessions();
  return context;
}
