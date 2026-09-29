import { createHash, randomBytes } from 'node:crypto';
import type { Snapshot } from '../../../packages/domain';
import type { Queryable } from '../db/database';
import type { ContentRepository, WorkingCopy } from './content';

export interface PublishedSnapshot {
  version: string;
  publishedAt: string;
  publishedBy: string;
  note: string;
  json: string;
  etag: string;
  data: Snapshot;
}

/** Remove drafts and hidden records so the published snapshot is visitor-safe. */
export function visitorSafe(copy: WorkingCopy): WorkingCopy {
  return {
    ...copy,
    tenants: copy.tenants.filter((t) => t.status !== 'HIDDEN'),
    pois: copy.pois.filter((p) => p.status === 'ACTIVE'),
    offers: copy.offers.filter((o) => o.status === 'ACTIVE'),
    events: copy.events.filter((e) => e.status === 'ACTIVE'),
    campaigns: copy.campaigns.filter((c) => c.status === 'ACTIVE' || c.status === 'SCHEDULED'),
  };
}

function newVersion(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = [now.getUTCFullYear(), pad(now.getUTCMonth() + 1), pad(now.getUTCDate())].join('.');
  const time = [pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds())].join(
    '',
  );
  return `${date}.${time}-${randomBytes(2).toString('hex')}`;
}

export class SnapshotRepository {
  private cache: PublishedSnapshot | null = null;

  constructor(
    private db: Queryable,
    private venueId: string,
  ) {}

  async publish(
    content: ContentRepository,
    publishedBy: string,
    note = '',
    db: Queryable = this.db,
  ) {
    const copy = visitorSafe(await content.workingCopy());
    const publishedAt = new Date().toISOString();
    const version = newVersion();
    const data: Snapshot = { version, publishedAt, ...copy };
    await db.query(
      'insert into published_snapshots (version, venue_id, data, published_at, published_by, note) values ($1, $2, $3::jsonb, $4, $5, $6)',
      [version, this.venueId, JSON.stringify(data), publishedAt, publishedBy, note],
    );
    this.cache = this.wrap({ version, publishedAt, publishedBy, note, data });
    return this.cache;
  }

  private wrap(input: Omit<PublishedSnapshot, 'json' | 'etag'>): PublishedSnapshot {
    const json = JSON.stringify(input.data);
    return { ...input, json, etag: `"${createHash('sha1').update(json).digest('base64url')}"` };
  }

  async latest(): Promise<PublishedSnapshot | null> {
    if (this.cache) return this.cache;
    const rows = await this.db.query<{
      version: string;
      data: Snapshot | string;
      published_at: Date | string;
      published_by: string;
      note: string;
    }>(
      'select version, data, published_at, published_by, note from published_snapshots where venue_id = $1 order by published_at desc limit 1',
      [this.venueId],
    );
    const row = rows[0];
    if (!row) return null;
    const data = typeof row.data === 'string' ? (JSON.parse(row.data) as Snapshot) : row.data;
    this.cache = this.wrap({
      version: row.version,
      publishedAt: new Date(row.published_at).toISOString(),
      publishedBy: row.published_by,
      note: row.note,
      data,
    });
    return this.cache;
  }

  invalidate() {
    this.cache = null;
  }

  async history(limit = 20) {
    const rows = await this.db.query<{
      version: string;
      published_at: Date | string;
      published_by: string;
      note: string;
    }>(
      'select version, published_at, published_by, note from published_snapshots where venue_id = $1 order by published_at desc limit $2',
      [this.venueId, limit],
    );
    return rows.map((r) => ({
      version: r.version,
      publishedAt: new Date(r.published_at).toISOString(),
      publishedBy: r.published_by,
      note: r.note,
    }));
  }
}
