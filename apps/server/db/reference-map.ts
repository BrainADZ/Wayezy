import { randomBytes } from 'node:crypto';
import { importReferenceLayout } from '../../../packages/domain/reference/import-layout';
import type { AppContext } from '../context';
import { ContentRepository } from '../repositories/content';

/** Import once, in one transaction, retaining both the old draft and published content for recovery. */
export async function installReferenceMap(context: AppContext) {
  if (!context.config.isDemo) return;
  const { db, config } = context;
  await db.query(
    `create table if not exists reference_map_imports (
      venue_id text primary key,
      original_working jsonb not null,
      original_published jsonb not null,
      imported_at timestamptz not null default now()
    )`,
  );
  if (
    (
      await db.query('select venue_id from reference_map_imports where venue_id = $1', [
        config.venueId,
      ])
    ).length
  )
    return;
  const working = await context.content.workingCopy();
  // Only the bundled Riverside geometry is eligible for this automatic demo upgrade.
  if (
    !working.nodes.some((n) => n.id === 'l0-kiosk-k001') ||
    working.floors.find((f) => f.id === 'l0')?.width !== 1400
  )
    return;
  const published = await context.snapshots.latest();
  if (!published) return;
  const converted = importReferenceLayout({
    ...working,
    version: published.version,
    publishedAt: published.publishedAt,
  });
  // Transform the existing published copy separately: unpublished admin edits stay unpublished.
  const publicData = importReferenceLayout(published.data);
  publicData.version = `${new Date().toISOString().slice(0, 10)}-reference-${randomBytes(4).toString('hex')}`;
  publicData.publishedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.query(
      'insert into reference_map_imports (venue_id, original_working, original_published) values ($1, $2::jsonb, $3::jsonb)',
      [config.venueId, JSON.stringify(working), JSON.stringify(published.data)],
    );
    const content = new ContentRepository(tx, config.venueId);
    for (const resource of [
      'floors',
      'features',
      'nodes',
      'edges',
      'connectors',
      'tenants',
    ] as const) {
      const existing = new Set(working[resource].map((item) => item.id));
      for (const item of converted[resource]) {
        if (existing.has(item.id)) await content.update(resource, item.id, item);
        else await content.insertRaw(resource, item);
      }
    }
    await tx.query(
      'insert into published_snapshots (version, venue_id, data, published_at, published_by, note) values ($1, $2, $3::jsonb, $4, $5, $6)',
      [
        publicData.version,
        config.venueId,
        JSON.stringify(publicData),
        publicData.publishedAt,
        'reference-map-import',
        'Imported Brainadz kiosk map; original content retained in reference_map_imports',
      ],
    );
  });
  context.snapshots.invalidate();
  context.logger.info('Reference kiosk map imported', {
    floors: converted.floors.length,
    tenants: converted.tenants.length,
  });
}
