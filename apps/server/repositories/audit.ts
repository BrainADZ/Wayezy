import type { Queryable } from '../db/database';

export interface AuditEntry {
  id: number;
  at: string;
  userId: string | null;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before: unknown;
  after: unknown;
}

export interface AuditActor {
  id: string;
  email: string;
}

export class AuditRepository {
  constructor(
    private db: Queryable,
    private venueId: string,
  ) {}

  async record(
    entry: {
      actor?: AuditActor | null;
      action: string;
      entityType: string;
      entityId?: string;
      summary?: string;
      before?: unknown;
      after?: unknown;
    },
    db: Queryable = this.db,
  ) {
    await db.query(
      'insert into audit_log (venue_id, user_id, user_email, action, entity_type, entity_id, summary, before, after) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)',
      [
        this.venueId,
        entry.actor?.id ?? null,
        entry.actor?.email ?? '',
        entry.action,
        entry.entityType,
        entry.entityId ?? '',
        (entry.summary ?? '').slice(0, 500),
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
      ],
    );
  }

  async list(
    options: { limit?: number; offset?: number; entityType?: string; action?: string } = {},
  ) {
    const params: unknown[] = [this.venueId];
    const where = ['venue_id = $1'];
    if (options.entityType) {
      params.push(options.entityType);
      where.push(`entity_type = $${params.length}`);
    }
    if (options.action) {
      params.push(options.action);
      where.push(`action = $${params.length}`);
    }
    params.push(Math.min(options.limit ?? 50, 200), options.offset ?? 0);
    const rows = await this.db.query<{
      id: number;
      at: Date | string;
      user_id: string | null;
      user_email: string;
      action: string;
      entity_type: string;
      entity_id: string;
      summary: string;
      before: unknown;
      after: unknown;
    }>(
      `select * from audit_log where ${where.join(' and ')} order by at desc, id desc limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return rows.map((r): AuditEntry => ({
      id: Number(r.id),
      at: new Date(r.at).toISOString(),
      userId: r.user_id,
      userEmail: r.user_email,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      summary: r.summary,
      before: r.before,
      after: r.after,
    }));
  }

  /** Content changes since the given time (used for "unpublished changes"). */
  async changesSince(since: string | null) {
    const rows = await this.db.query<{ n: number }>(
      `select count(*)::int as n from audit_log where venue_id = $1 and action in ('create', 'update', 'delete', 'closure') and ($2::timestamptz is null or at > $2::timestamptz)`,
      [this.venueId, since],
    );
    return rows[0]?.n ?? 0;
  }
}
