import type { Database } from './database';

/**
 * Ordered SQL migrations. Kept in TypeScript so the production server bundle carries them.
 * `docs/database/schema.sql` is generated from this file (npm run assets).
 */
export const migrations: { id: string; sql: string }[] = [
  {
    id: '001_initial_schema',
    sql: /* sql */ `
create table venues (
  id text primary key,
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  address text not null default '',
  description text not null default '',
  brand_color text not null default '#1a5cff',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  opening_hours text not null default '',
  default_language text not null default 'en',
  languages jsonb not null default '["en"]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table floors (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  short_name text not null,
  theme text not null default '',
  level integer not null,
  width double precision not null,
  height double precision not null,
  metres_per_unit double precision not null,
  outline jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  synonyms jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table map_features (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  floor_id text not null references floors(id) on delete restrict,
  label text not null,
  kind text not null default 'unit',
  points jsonb not null,
  color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index map_features_floor on map_features(floor_id);

create table route_nodes (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  floor_id text not null references floors(id) on delete restrict,
  x double precision not null,
  y double precision not null,
  label text not null,
  type text not null,
  connector_id text not null default '',
  landmark boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index route_nodes_floor on route_nodes(floor_id);

create table route_edges (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  from_node text not null references route_nodes(id) on delete cascade,
  to_node text not null references route_nodes(id) on delete cascade,
  distance double precision not null,
  type text not null,
  weight double precision not null default 1,
  direction text not null default 'BOTH',
  active boolean not null default true,
  accessible boolean not null default true,
  restricted boolean not null default false,
  estimated_time double precision not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index route_edges_from on route_edges(from_node);
create index route_edges_to on route_edges(to_node);

create table vertical_connectors (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  type text not null,
  direction text not null,
  accessible boolean not null,
  node_ids jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenants (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  trading_name text not null default '',
  category_id text not null references categories(id) on delete restrict,
  subcategory text not null default '',
  floor_id text not null references floors(id) on delete restrict,
  unit_number text not null,
  node_id text not null references route_nodes(id) on delete restrict,
  feature_id text not null references map_features(id) on delete restrict,
  short_summary text not null default '',
  description text not null default '',
  keywords jsonb not null default '[]',
  product_types jsonb not null default '[]',
  services jsonb not null default '[]',
  brands jsonb not null default '[]',
  logo text not null default '',
  hero_image text not null default '',
  gallery jsonb not null default '[]',
  brand_color text not null default '#3b5bdb',
  hours jsonb not null,
  phone text not null default '',
  website text not null default '',
  accessibility_notes text not null default '',
  status text not null default 'ACTIVE',
  anchor boolean not null default false,
  dining jsonb,
  cinema jsonb,
  i18n jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenants_category on tenants(category_id);
create index tenants_floor on tenants(floor_id);

create table pois (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  type text not null,
  floor_id text not null references floors(id) on delete restrict,
  node_id text not null references route_nodes(id) on delete restrict,
  feature_id text not null default '',
  accessible boolean not null default true,
  description text not null default '',
  hours text not null default '',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table offers (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  tenant_id text not null references tenants(id) on delete cascade,
  title text not null,
  highlight text not null default '',
  description text not null default '',
  image text not null default '',
  start_date text not null,
  end_date text not null,
  terms text not null default '',
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  title text not null,
  description text not null default '',
  image text not null default '',
  start_date text not null,
  end_date text not null,
  time_label text not null default '',
  destination_id text not null default '',
  location_label text not null default '',
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media_assets (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  url text not null,
  storage_key text not null default '',
  mime_type text not null,
  size bigint not null default 0,
  width integer not null default 0,
  height integer not null default 0,
  duration double precision not null default 0,
  kind text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaigns (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  advertiser text not null,
  description text not null default '',
  status text not null default 'DRAFT',
  start_date text not null,
  end_date text not null,
  start_time text not null,
  end_time text not null,
  days_of_week jsonb not null,
  media_id text not null references media_assets(id) on delete restrict,
  duration integer not null,
  priority text not null default 'NORMAL',
  target_type text not null default 'ALL',
  targets jsonb not null default '[]',
  tap_destination_id text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table devices (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  floor_id text not null references floors(id) on delete restrict,
  location_description text not null,
  route_start_node text not null references route_nodes(id) on delete restrict,
  device_group text not null default 'default',
  screen_orientation text not null default 'PORTRAIT',
  status text not null default 'ACTIVE',
  idle_timeout integer not null default 10,
  default_language text not null default 'en',
  device_key_hash text not null default '',
  software_version text not null default '',
  last_heartbeat_at timestamptz,
  last_content_version text not null default '',
  last_status jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table device_heartbeats (
  id bigserial primary key,
  device_id text not null references devices(id) on delete cascade,
  received_at timestamptz not null default now(),
  software_version text not null default '',
  content_version text not null default '',
  status jsonb not null default '{}'
);
create index device_heartbeats_device_time on device_heartbeats(device_id, received_at desc);

create table users (
  id text primary key,
  venue_id text not null references venues(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null,
  active boolean not null default true,
  password_hash text not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent text not null default ''
);
create index sessions_user on sessions(user_id);

create table audit_log (
  id bigserial primary key,
  venue_id text not null,
  at timestamptz not null default now(),
  user_id text,
  user_email text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  summary text not null default '',
  before jsonb,
  after jsonb
);
create index audit_log_time on audit_log(venue_id, at desc);

create table analytics_events (
  id bigserial primary key,
  event_id text unique,
  venue_id text not null,
  type text not null,
  app text not null default 'kiosk',
  device_id text not null default '',
  session_id text not null default '',
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  props jsonb not null default '{}',
  source text not null default 'live'
);
create index analytics_events_time on analytics_events(venue_id, occurred_at desc);
create index analytics_events_type_time on analytics_events(venue_id, type, occurred_at desc);

create table published_snapshots (
  version text primary key,
  venue_id text not null,
  data jsonb not null,
  published_at timestamptz not null default now(),
  published_by text not null default '',
  note text not null default ''
);
create index published_snapshots_time on published_snapshots(venue_id, published_at desc);

create table settings (
  venue_id text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (venue_id, key)
);
`,
  },
];

export async function migrate(db: Database) {
  await db.exec(
    `create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`,
  );
  const applied = new Set(
    (await db.query<{ id: string }>('select id from schema_migrations')).map((r) => r.id),
  );
  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await db.transaction(async (tx) => {
      // Split on statement boundaries so both pg and PGlite accept the batch inside a transaction.
      for (const statement of migration.sql
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query('insert into schema_migrations (id) values ($1)', [migration.id]);
    });
    ran.push(migration.id);
  }
  return ran;
}

export const allTables = [
  'published_snapshots',
  'analytics_events',
  'audit_log',
  'sessions',
  'users',
  'device_heartbeats',
  'devices',
  'campaigns',
  'media_assets',
  'events',
  'offers',
  'pois',
  'tenants',
  'vertical_connectors',
  'route_edges',
  'route_nodes',
  'map_features',
  'categories',
  'floors',
  'settings',
  'venues',
  'schema_migrations',
];

export async function dropAll(db: Database) {
  for (const table of allTables) await db.exec(`drop table if exists ${table} cascade`);
}
