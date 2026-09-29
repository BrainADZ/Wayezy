import type { AnalyticsEvent } from '../../../packages/domain';
import type { Queryable } from '../db/database';

export interface AnalyticsFilter {
  from: string;
  to: string;
  deviceId?: string;
  floorId?: string;
  timezone: string;
}

/**
 * Kiosk interaction analytics. These are *interaction* metrics (sessions, searches, route
 * requests, QR hand-offs, ad plays) — not footfall, which would need physical sensing.
 */
export class AnalyticsRepository {
  constructor(
    private db: Queryable,
    private venueId: string,
  ) {}

  /** Idempotent batch insert: client-generated event IDs make retried offline queues safe. */
  async insert(
    events: AnalyticsEvent[],
    source: 'live' | 'server' | 'demo-seed' = 'live',
    db: Queryable = this.db,
  ) {
    if (!events.length) return 0;
    const params: unknown[] = [];
    const values = events.map((e) => {
      params.push(
        e.id,
        this.venueId,
        e.type,
        e.app,
        e.deviceId,
        e.sessionId,
        e.occurredAt,
        JSON.stringify(e.props ?? {}),
        source,
      );
      const n = params.length;
      return `($${n - 8}, $${n - 7}, $${n - 6}, $${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}::timestamptz, $${n - 1}::jsonb, $${n})`;
    });
    const rows = await db.query(
      `insert into analytics_events (event_id, venue_id, type, app, device_id, session_id, occurred_at, props, source)
       values ${values.join(', ')} on conflict (event_id) do nothing returning id`,
      params,
    );
    return rows.length;
  }

  private scope(filter: AnalyticsFilter, params: unknown[]) {
    params.push(this.venueId, filter.from, filter.to);
    const where = [
      `venue_id = $1`,
      `occurred_at >= $2::timestamptz`,
      `occurred_at < $3::timestamptz`,
    ];
    if (filter.deviceId) {
      params.push(filter.deviceId);
      where.push(`device_id = $${params.length}`);
    }
    if (filter.floorId) {
      params.push(filter.floorId);
      where.push(
        `device_id in (select id from devices where venue_id = $1 and floor_id = $${params.length})`,
      );
    }
    return where.join(' and ');
  }

  async summary(filter: AnalyticsFilter) {
    const counts = async () => {
      const params: unknown[] = [];
      const rows = await this.db.query<{ type: string; n: number }>(
        `select type, count(*)::int as n from analytics_events where ${this.scope(filter, params)} group by type`,
        params,
      );
      return Object.fromEntries(rows.map((r) => [r.type, Number(r.n)])) as Record<string, number>;
    };
    const daily = async () => {
      const params: unknown[] = [];
      const where = this.scope(filter, params);
      params.push(filter.timezone);
      const rows = await this.db.query<{ day: string; type: string; n: number }>(
        `select to_char((occurred_at at time zone $${params.length})::date, 'YYYY-MM-DD') as day, type, count(*)::int as n
         from analytics_events where ${where} and type in ('session_started','search_submitted','route_requested','qr_opened','ad_started')
         group by 1, 2 order by 1`,
        params,
      );
      return rows;
    };
    const top = async (type: string, prop: string, limit = 10) => {
      const params: unknown[] = [];
      const where = this.scope(filter, params);
      params.push(type, limit);
      const rows = await this.db.query<{ key: string; n: number }>(
        `select lower(props->>'${prop}') as key, count(*)::int as n from analytics_events
         where ${where} and type = $${params.length - 1} and coalesce(props->>'${prop}', '') <> ''
         group by 1 order by n desc, key limit $${params.length}`,
        params,
      );
      return rows.map((r) => ({ key: r.key, count: Number(r.n) }));
    };
    const byDevice = async () => {
      const params: unknown[] = [];
      const rows = await this.db.query<{ device_id: string; type: string; n: number }>(
        `select device_id, type, count(*)::int as n from analytics_events where ${this.scope(filter, params)} and device_id <> ''
         and type in ('session_started','search_submitted','route_requested','qr_displayed','ad_started') group by 1, 2`,
        params,
      );
      return rows;
    };
    const byCampaign = async () => {
      const params: unknown[] = [];
      const rows = await this.db.query<{ campaign: string; type: string; n: number }>(
        `select props->>'campaignId' as campaign, type, count(*)::int as n from analytics_events
         where ${this.scope(filter, params)} and type in ('ad_started','ad_completed','ad_tapped','ad_error') and coalesce(props->>'campaignId','') <> ''
         group by 1, 2`,
        params,
      );
      return rows;
    };
    const seeded = async () => {
      const rows = await this.db.query<{ n: number }>(
        `select count(*)::int as n from analytics_events where venue_id = $1 and source = 'demo-seed'`,
        [this.venueId],
      );
      return Number(rows[0]?.n ?? 0);
    };

    const [c, d, searches, zero, destinations, categories, devices, campaigns, demoSeedEvents] =
      await Promise.all([
        counts(),
        daily(),
        top('search_submitted', 'query'),
        top('search_no_result', 'query'),
        top('route_requested', 'destinationId'),
        top('category_opened', 'categoryId'),
        byDevice(),
        byCampaign(),
        seeded(),
      ]);
    const n = (type: string) => c[type] ?? 0;
    const dayMap = new Map<string, Record<string, number>>();
    for (const row of d) {
      const entry = dayMap.get(row.day) ?? {};
      entry[row.type] = Number(row.n);
      dayMap.set(row.day, entry);
    }
    const deviceMap = new Map<string, Record<string, number>>();
    for (const row of devices) {
      const entry = deviceMap.get(row.device_id) ?? {};
      entry[row.type] = Number(row.n);
      deviceMap.set(row.device_id, entry);
    }
    const campaignMap = new Map<string, Record<string, number>>();
    for (const row of campaigns) {
      const entry = campaignMap.get(row.campaign) ?? {};
      entry[row.type] = Number(row.n);
      campaignMap.set(row.campaign, entry);
    }
    const qrShown = n('qr_displayed') || n('qr_generated');
    return {
      range: { from: filter.from, to: filter.to },
      totals: {
        sessions: n('session_started'),
        searches: n('search_submitted'),
        zeroResultSearches: n('search_no_result'),
        tenantViews: n('tenant_profile_viewed'),
        routeRequests: n('route_requested'),
        routesGenerated: n('route_generated'),
        routeFailures: n('route_failed'),
        accessibleRoutes: n('accessible_route_selected'),
        qrGenerated: qrShown,
        qrOpened: n('qr_opened'),
        offerOpens: n('offer_opened'),
        eventOpens: n('event_opened'),
        adImpressions: n('ad_started'),
        adCompletions: n('ad_completed'),
        adTaps: n('ad_tapped'),
        adErrors: n('ad_error'),
        clientErrors: n('client_error'),
      },
      qrOpenRate: qrShown ? Math.round((n('qr_opened') / qrShown) * 1000) / 10 : 0,
      daily: [...dayMap.entries()].map(([date, v]) => ({
        date,
        sessions: v.session_started ?? 0,
        searches: v.search_submitted ?? 0,
        routes: v.route_requested ?? 0,
        qrOpened: v.qr_opened ?? 0,
        adPlays: v.ad_started ?? 0,
      })),
      topSearches: searches,
      zeroResultTerms: zero,
      topDestinations: destinations,
      topCategories: categories,
      devices: [...deviceMap.entries()].map(([deviceId, v]) => ({
        deviceId,
        sessions: v.session_started ?? 0,
        searches: v.search_submitted ?? 0,
        routes: v.route_requested ?? 0,
        qrDisplayed: v.qr_displayed ?? 0,
        adPlays: v.ad_started ?? 0,
      })),
      campaigns: [...campaignMap.entries()].map(([campaignId, v]) => ({
        campaignId,
        impressions: v.ad_started ?? 0,
        completions: v.ad_completed ?? 0,
        taps: v.ad_tapped ?? 0,
        errors: v.ad_error ?? 0,
      })),
      demoSeedEvents,
    };
  }

  async clearDemoSeed() {
    const rows = await this.db.query(
      `delete from analytics_events where venue_id = $1 and source = 'demo-seed' returning id`,
      [this.venueId],
    );
    return rows.length;
  }

  async purgeOlderThan(days: number) {
    await this.db.query(
      `delete from analytics_events where venue_id = $1 and occurred_at < now() - ($2::int * interval '1 day')`,
      [this.venueId, days],
    );
  }
}
