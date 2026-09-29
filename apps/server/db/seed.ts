import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AnalyticsEvent, AnalyticsEventName } from '../../../packages/domain';
import { createDemoSnapshot } from '../../../packages/domain/seed';
import type { AppConfig } from '../config';
import type { AppContext } from '../context';
import { AnalyticsRepository } from '../repositories/analytics';
import { ContentRepository, type TableResource } from '../repositories/content';
import { DeviceRepository } from '../repositories/devices';
import { SettingsRepository } from '../repositories/settings';

/** Inserts the Riverside demo mall, issues device keys, and publishes version 1. */
export async function seedDemo(
  context: Pick<AppContext, 'db' | 'config' | 'snapshots' | 'content'>,
  options: { analytics: boolean },
) {
  const snapshot = createDemoSnapshot();
  const venueId = context.config.venueId;
  const deviceKeys: Record<string, string> = {};

  await context.db.transaction(async (tx) => {
    const content = new ContentRepository(tx, venueId);
    await content.insertVenue({ ...snapshot.venue, id: venueId });
    const order: [TableResource, Record<string, unknown>[]][] = [
      ['floors', snapshot.floors],
      ['categories', snapshot.categories],
      ['features', snapshot.features],
      ['nodes', snapshot.nodes],
      ['edges', snapshot.edges],
      ['connectors', snapshot.connectors],
      ['media', snapshot.media],
      ['tenants', snapshot.tenants],
      ['pois', snapshot.pois],
      ['offers', snapshot.offers],
      ['events', snapshot.events],
      ['campaigns', snapshot.campaigns],
      ['devices', snapshot.devices],
    ];
    for (const [resource, items] of order)
      for (const item of items) await content.insertRaw(resource, item);
    const devices = new DeviceRepository(tx, venueId);
    for (const device of snapshot.devices)
      deviceKeys[device.id] = (await devices.rotateKey(device.id))!;
    await new SettingsRepository(tx, venueId).update({});
  });

  await context.snapshots.publish(context.content, 'seed', 'Demo mall seeded');
  if (options.analytics)
    await seedDemoAnalytics(
      new AnalyticsRepository(context.db, venueId),
      snapshot.devices.map((d) => d.id),
    );
  return { deviceKeys, tenants: snapshot.tenants.length };
}

/** Deterministic pseudo-random generator so demo analytics look the same on every machine. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two weeks of plausible kiosk interaction history, tagged source='demo-seed' so Command can
 * label it and an admin can clear it. Live events are added on top during the demo.
 */
export async function seedDemoAnalytics(
  analytics: AnalyticsRepository,
  deviceIds: string[],
  now = new Date(),
) {
  const random = mulberry32(20260917);
  const pick = <T>(items: [T, number][]) => {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = random() * total;
    for (const [item, weight] of items) if ((r -= weight) <= 0) return item;
    return items[0][0];
  };
  const searches: [string, number][] = [
    ['zara', 12],
    ['italian food', 10],
    ['cinema', 9],
    ['shoes', 8],
    ['coffee', 8],
    ['iphone', 6],
    ['washroom', 7],
    ['pvr', 5],
    ['nike', 5],
    ['atm', 5],
    ['kids clothes', 4],
    ['pizza', 4],
    ['sephora', 3],
    ['parking', 3],
  ];
  const zero: [string, number][] = [
    ['bookstore', 4],
    ['nail salon', 3],
    ['watch repair', 2],
    ['currency exchange', 2],
  ];
  const destinations: [string, number][] = [
    ['zara', 10],
    ['pvr', 9],
    ['food-court', 8],
    ['olive-trattoria', 6],
    ['starbucks', 6],
    ['apple', 6],
    ['hm', 5],
    ['nike', 5],
    ['pizza-express', 4],
    ['decathlon', 4],
    ['l0-washroom-west', 5],
    ['l0-atm', 3],
    ['timezone', 3],
    ['sephora', 3],
  ];
  const categories: [string, number][] = [
    ['fashion', 8],
    ['dining', 9],
    ['cinema', 5],
    ['beauty', 3],
    ['electronics', 4],
    ['services', 2],
  ];
  const campaigns: [string, number][] = [
    ['camp-festive-fashion', 5],
    ['camp-olive-pasta', 3],
    ['camp-pvr-weekend', 3],
  ];
  const activeDevices = deviceIds.slice(0, 3);

  const events: AnalyticsEvent[] = [];
  const push = (
    type: AnalyticsEventName,
    deviceId: string,
    sessionId: string,
    at: Date,
    props: AnalyticsEvent['props'] = {},
  ) =>
    events.push({
      id: `seed-${randomBytes(8).toString('hex')}`,
      type,
      deviceId,
      sessionId,
      app: type === 'qr_opened' ? 'go' : 'kiosk',
      occurredAt: at.toISOString(),
      props,
    });

  for (let daysAgo = 14; daysAgo >= 1; daysAgo--) {
    const day = new Date(now.getTime() - daysAgo * 86400_000);
    const weekend = [0, 5, 6].includes(day.getUTCDay());
    for (const deviceId of activeDevices) {
      const sessions = Math.round(
        (weekend ? 48 : 30) * (0.8 + random() * 0.4) * (deviceId === 'K-001' ? 1.3 : 1),
      );
      for (let s = 0; s < sessions; s++) {
        // 10:00–22:00 IST = 04:30–16:30 UTC.
        const start = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 4, 30) +
            random() * 12 * 3600_000,
        );
        const sessionId = `seed-s-${randomBytes(6).toString('hex')}`;
        let t = start.getTime();
        const at = (seconds: number) => new Date((t += seconds * 1000));
        push('session_started', deviceId, sessionId, at(0));
        if (random() < 0.35)
          push('category_opened', deviceId, sessionId, at(4), { categoryId: pick(categories) });
        if (random() < 0.7) {
          if (random() < 0.08) {
            const query = pick(zero);
            push('search_submitted', deviceId, sessionId, at(6), { query, results: 0 });
            push('search_no_result', deviceId, sessionId, at(1), { query });
          } else {
            push('search_submitted', deviceId, sessionId, at(6), {
              query: pick(searches),
              results: 3,
            });
          }
        }
        if (random() < 0.65) {
          const destinationId = pick(destinations);
          push('tenant_profile_viewed', deviceId, sessionId, at(5), { destinationId });
          if (random() < 0.75) {
            const accessible = random() < 0.07;
            push('route_requested', deviceId, sessionId, at(8), { destinationId, accessible });
            push('route_generated', deviceId, sessionId, at(0), { destinationId, accessible });
            if (accessible)
              push('accessible_route_selected', deviceId, sessionId, at(2), { destinationId });
            if (random() < 0.38) {
              push('qr_displayed', deviceId, sessionId, at(10), { destinationId });
              if (random() < 0.62)
                push('qr_opened', deviceId, sessionId, at(20), { destinationId });
            }
          }
        }
        if (random() < 0.12)
          push('offer_opened', deviceId, sessionId, at(7), { offerId: 'offer-olive-pasta' });
        push('session_reset', deviceId, sessionId, at(15));
        const plays = 2 + Math.floor(random() * 3);
        for (let p = 0; p < plays; p++) {
          const campaignId = pick(campaigns);
          push('ad_started', deviceId, '', at(2), { campaignId });
          if (random() < 0.92) push('ad_completed', deviceId, '', at(10), { campaignId });
          if (random() < 0.03) push('ad_tapped', deviceId, '', at(1), { campaignId });
        }
      }
    }
  }
  for (let i = 0; i < events.length; i += 400)
    await analytics.insert(events.slice(i, i + 400), 'demo-seed');
  return events.length;
}

export function writeDemoAccessFile(
  config: AppConfig,
  input: {
    adminEmail: string;
    adminPassword: string;
    demoAccounts: { email: string; role: string; password: string }[];
    deviceKeys: Record<string, string>;
    baseUrl: string;
  },
) {
  const file = path.resolve(config.dataDir, 'demo-access.txt');
  const lines = [
    'WAY EZY — demo access (generated on first start; keep private)',
    '',
    `Command:  ${input.baseUrl}/command`,
    `Super Admin: ${input.adminEmail} / ${config.adminPassword ? 'password set in .env' : input.adminPassword}`,
    ...input.demoAccounts.map((a) => `${a.role.padEnd(20)} ${a.email} / ${a.password}`),
    '',
    'Kiosk provisioning links (open once on each kiosk; the key is stored on the device):',
    ...Object.entries(input.deviceKeys).map(
      ([id, key]) =>
        `${id}: ${input.baseUrl}/?device=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`,
    ),
    '',
    'Run npm run db:reset to start again with fresh demo records and credentials.',
  ];
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  return file;
}

/** Remove stale generated credentials after an environment-managed admin takes over. */
export function syncDemoAccessAdmin(config: AppConfig, adminEmail: string) {
  const file = path.resolve(config.dataDir, 'demo-access.txt');
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const updated = content.replace(
    /^Super Admin:.*$/m,
    `Super Admin: ${adminEmail} / password set in .env`,
  );
  if (updated !== content) fs.writeFileSync(file, updated, { mode: 0o600 });
}
