import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';

/** Project root, valid both from source (apps/server) and from the bundle (dist/server). */
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
    );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** demo = self-seeding presenter build; production = no demo shortcuts, secrets required. */
  APP_MODE: z.enum(['demo', 'production']).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4173),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default(''),
  DATABASE_SSL: z.string().optional(),
  MONGODB_URI: z.string().default(''),
  MONGODB_DATABASE: z.string().default('wayezy'),
  MONGODB_IMPORT_PGLITE: z.string().optional(),
  DATA_DIR: z.string().default('.data'),
  VENUE_ID: z.string().default('riverside'),
  PUBLIC_BASE_URL: z.string().default(''),
  ROUTE_TOKEN_SECRET: z.string().default(''),
  QR_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(120),
  ADMIN_EMAIL: z.email().default('admin@wayezy.local'),
  ADMIN_PASSWORD: z.string().default(''),
  ADMIN_NAME: z.string().default('WAY EZY Admin'),
  SECURE_COOKIES: z.string().optional(),
  TRUST_PROXY: z.string().default(''),
  SESSION_HOURS: z.coerce.number().min(1).max(72).default(12),
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_BUCKET: z.string().default('way-ezy-media'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(200).default(40),
  SEED_DEMO: z.string().optional(),
  DEMO_USERS: z.string().optional(),
  DEMO_ANALYTICS: z.string().optional(),
  ALLOW_UNSIGNED_DEEP_LINKS: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = ReturnType<typeof loadConfig>;

/** Read .env for direct Node/npm starts; explicit environment variables take precedence. */
export function readEnvironment(
  envFile = path.resolve(projectRoot, '.env'),
  overrides: Record<string, string | undefined> = process.env,
) {
  const fileEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
  return { ...fileEnv, ...overrides };
}

export function loadConfig(env: Record<string, string | undefined> = readEnvironment()) {
  const raw = envSchema.parse(env);
  const production = raw.NODE_ENV === 'production';
  const mode = raw.APP_MODE ?? (production ? 'production' : 'demo');
  const demo = mode === 'demo';
  const config = {
    env: raw.NODE_ENV,
    mode,
    isProduction: production,
    isDemo: demo,
    port: raw.PORT,
    host: raw.HOST,
    databaseUrl: raw.DATABASE_URL,
    databaseSsl: bool(false).parse(raw.DATABASE_SSL),
    mongoUri: raw.MONGODB_URI,
    mongoDatabase: raw.MONGODB_DATABASE,
    mongoImportPglite: bool(false).parse(raw.MONGODB_IMPORT_PGLITE),
    dataDir: path.resolve(projectRoot, raw.DATA_DIR),
    venueId: raw.VENUE_ID,
    publicBaseUrl: raw.PUBLIC_BASE_URL.replace(/\/$/, ''),
    routeTokenSecret: raw.ROUTE_TOKEN_SECRET,
    qrTokenTtlMinutes: raw.QR_TOKEN_TTL_MINUTES,
    adminEmail: raw.ADMIN_EMAIL.toLowerCase(),
    adminPassword: raw.ADMIN_PASSWORD,
    adminName: raw.ADMIN_NAME,
    secureCookies: bool(production && !demo).parse(raw.SECURE_COOKIES),
    trustProxy: raw.TRUST_PROXY,
    sessionHours: raw.SESSION_HOURS,
    storageDriver: raw.STORAGE_DRIVER,
    supabaseUrl: raw.SUPABASE_URL.replace(/\/$/, ''),
    supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: raw.SUPABASE_BUCKET,
    maxUploadBytes: Math.round(raw.MAX_UPLOAD_MB * 1024 * 1024),
    seedDemo: bool(demo).parse(raw.SEED_DEMO),
    demoUsers: bool(demo).parse(raw.DEMO_USERS),
    demoAnalytics: bool(demo).parse(raw.DEMO_ANALYTICS),
    allowUnsignedDeepLinks: bool(demo).parse(raw.ALLOW_UNSIGNED_DEEP_LINKS),
    logLevel: raw.LOG_LEVEL,
  };

  const problems: string[] = [];
  const minimumAdminPasswordLength = mode === 'production' ? 12 : 8;
  if (config.adminPassword && config.adminPassword.length < minimumAdminPasswordLength)
    problems.push(`ADMIN_PASSWORD must be at least ${minimumAdminPasswordLength} characters.`);
  if (mode === 'production') {
    if (config.routeTokenSecret.length < 32)
      problems.push('ROUTE_TOKEN_SECRET must be at least 32 characters in production.');
    try {
      if (new URL(config.publicBaseUrl).protocol !== 'https:')
        problems.push('PUBLIC_BASE_URL must be an https:// URL in production (used in QR codes).');
    } catch {
      problems.push(
        'PUBLIC_BASE_URL must be a valid https:// URL in production (used in QR codes).',
      );
    }
    if (
      config.storageDriver === 'supabase' &&
      (!config.supabaseUrl || !config.supabaseServiceRoleKey)
    )
      problems.push(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_DRIVER=supabase.',
      );
  }
  if (problems.length) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  return config;
}
