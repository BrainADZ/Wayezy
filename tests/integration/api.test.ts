import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import type { Snapshot } from '../../packages/domain';
import { findRoute } from '../../packages/routing';
import { signRouteToken } from '../../apps/server/services/route-tokens';
import { ADMIN_EMAIL, Client, startTestServer, type TestServer } from './helpers';

let server: TestServer;
let admin: Client;

before(async () => {
  server = await startTestServer();
  admin = new Client(server.url);
  await admin.login();
});
after(async () => {
  await server?.close();
});

const snapshot = async () => (await new Client(server.url).get('/api/snapshot')).body as Snapshot;

describe('authentication', () => {
  it('rejects wrong passwords without revealing which field was wrong', async () => {
    const client = new Client(server.url);
    const result = await client.post('/api/auth/login', {
      email: ADMIN_EMAIL,
      password: 'wrong-password-123',
    });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.message, 'Email or password is incorrect.');
  });

  it('requires the CSRF header on sign-in and admin mutations', async () => {
    const client = new Client(server.url);
    const blocked = await client.post(
      '/api/auth/login',
      { email: ADMIN_EMAIL, password: 'x' },
      { csrf: false },
    );
    assert.equal(blocked.status, 403);
    const mutation = await admin.post('/api/admin/publish', { note: 'x' }, { csrf: false });
    assert.equal(mutation.status, 403);
  });

  it('issues an httpOnly session cookie and supports sign-out', async () => {
    const client = new Client(server.url);
    assert.deepEqual((await client.get('/api/auth/session')).body, { authenticated: false });
    const login = await client.login();
    assert.deepEqual((await client.get('/api/auth/session')).body, { authenticated: true });
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Strict/i);
    assert.equal((await client.get('/api/auth/me')).status, 200);
    await client.post('/api/auth/logout');
    client.cookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (await client.get('/api/auth/me')).status,
      401,
      'old session token no longer works',
    );
  });

  it('blocks admin APIs for anonymous visitors', async () => {
    const anonymous = new Client(server.url);
    assert.equal((await anonymous.get('/api/admin/resources/tenants')).status, 401);
  });
});

describe('role-based access control (server-side)', () => {
  const analyst = new Client('');
  const content = new Client('');
  before(async () => {
    Object.assign(analyst, new Client(server.url));
    Object.assign(content, new Client(server.url));
    for (const [email, role] of [
      ['analyst@test.local', 'ANALYST'],
      ['content@test.local', 'CONTENT_MANAGER'],
    ] as const) {
      const created = await admin.post('/api/admin/users', {
        name: role,
        email,
        role,
        active: true,
        password: 'long-enough-password',
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
    }
    await analyst.login('analyst@test.local', 'long-enough-password');
    await content.login('content@test.local', 'long-enough-password');
  });

  it('lets an analyst read analytics but not change tenants', async () => {
    assert.equal((await analyst.get('/api/admin/analytics?days=7')).status, 200);
    const update = await analyst.put('/api/admin/resources/tenants/zara', {
      shortSummary: 'Hacked',
    });
    assert.equal(update.status, 403);
    assert.equal((await analyst.post('/api/admin/publish', { note: '' })).status, 403);
  });

  it('lets a content manager edit tenants but not campaigns, routing or users', async () => {
    assert.equal(
      (
        await content.put('/api/admin/resources/tenants/zara', {
          shortSummary: 'Contemporary fashion for everyone.',
        })
      ).status,
      200,
    );
    assert.equal(
      (await content.put('/api/admin/resources/campaigns/camp-olive-pasta', { priority: 'HIGH' }))
        .status,
      403,
    );
    assert.equal(
      (await content.post('/api/admin/routing/closures', { edgeId: 'l0-ring-e1', closed: true }))
        .status,
      403,
    );
    assert.equal((await content.get('/api/admin/users')).status, 403);
  });
});

describe('tenant CRUD and publishing', () => {
  it('validates input and links with actionable messages', async () => {
    const bad = await admin.post('/api/admin/resources/tenants', {
      name: '',
      categoryId: 'fashion',
    });
    assert.equal(bad.status, 400);
    assert.ok(Array.isArray(bad.body.error.details));
  });

  it('creates, updates, publishes and deletes a tenant; visitors only see published changes', async () => {
    const zara = (await admin.get('/api/admin/resources/tenants')).body.find(
      (t: { id: string }) => t.id === 'zara',
    );
    const input = {
      ...zara,
      id: 'pop-up-store',
      name: 'Pop-up Store',
      unitNumber: 'L1-99',
      status: 'ACTIVE',
    };
    // Same node/feature as Zara is allowed at the data layer (e.g. a pop-up inside a unit).
    const created = await admin.post('/api/admin/resources/tenants', input);
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const updated = await admin.put('/api/admin/resources/tenants/pop-up-store', {
      shortSummary: 'Limited-time designer pop-up',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.shortSummary, 'Limited-time designer pop-up');

    assert.ok(
      !(await snapshot()).tenants.some((t) => t.id === 'pop-up-store'),
      'not visible before publishing',
    );
    const status = await admin.get('/api/admin/publish/status');
    assert.ok(status.body.pendingChanges >= 2);

    const published = await admin.post('/api/admin/publish', { note: 'Add pop-up' });
    assert.equal(published.status, 201);
    const live = await snapshot();
    assert.equal(live.version, published.body.version);
    assert.equal(
      live.tenants.find((t) => t.id === 'pop-up-store')?.shortSummary,
      'Limited-time designer pop-up',
    );

    assert.equal((await admin.delete('/api/admin/resources/tenants/pop-up-store')).status, 200);
    await admin.post('/api/admin/publish', { note: 'Remove pop-up' });
    assert.ok(!(await snapshot()).tenants.some((t) => t.id === 'pop-up-store'));

    const audit = await admin.get('/api/admin/audit?entityType=tenants');
    assert.ok(
      audit.body.some(
        (entry: { action: string; entityId: string }) =>
          entry.action === 'create' && entry.entityId === 'pop-up-store',
      ),
    );
  });

  it('hides HIDDEN tenants and draft offers from visitors', async () => {
    await admin.put('/api/admin/resources/tenants/superdry', { status: 'HIDDEN' });
    await admin.put('/api/admin/resources/offers/offer-nike', { status: 'DRAFT' });
    await admin.post('/api/admin/publish', {});
    const live = await snapshot();
    assert.ok(!live.tenants.some((t) => t.id === 'superdry'));
    assert.ok(!live.offers.some((o) => o.id === 'offer-nike'));
  });

  it('protects referenced records from deletion', async () => {
    const result = await admin.delete('/api/admin/resources/categories/dining');
    assert.equal(result.status, 409);
  });

  it('serves the snapshot with an ETag and 304 responses', async () => {
    const first = await fetch(`${server.url}/api/snapshot`);
    const etag = first.headers.get('etag')!;
    assert.ok(etag);
    const second = await fetch(`${server.url}/api/snapshot`, {
      headers: { 'if-none-match': etag },
    });
    assert.equal(second.status, 304);
  });
});

describe('campaign CRUD and scheduling', () => {
  it('creates a draft campaign, rejects invalid schedules, and publishes it when activated', async () => {
    const campaign = {
      name: 'Monsoon Sale',
      advertiser: 'Lifestyle',
      description: 'Up to 50% off',
      status: 'DRAFT',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      startTime: '00:00',
      endTime: '23:59',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      mediaId: 'media-festive-fashion',
      duration: 10,
      priority: 'HIGH',
      targetType: 'DEVICE',
      targets: ['K-001'],
    };
    const invalid = await admin.post('/api/admin/resources/campaigns', {
      ...campaign,
      endDate: '2026-08-01',
    });
    assert.equal(invalid.status, 400);
    const noTargets = await admin.post('/api/admin/resources/campaigns', {
      ...campaign,
      targets: [],
    });
    assert.equal(noTargets.status, 400);

    const created = await admin.post('/api/admin/resources/campaigns', campaign);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await admin.post('/api/admin/publish', {});
    assert.ok(
      !(await snapshot()).campaigns.some((c) => c.id === created.body.id),
      'drafts are not published',
    );

    await admin.put(`/api/admin/resources/campaigns/${created.body.id}`, { status: 'ACTIVE' });
    await admin.post('/api/admin/publish', {});
    const live = (await snapshot()).campaigns.find((c) => c.id === created.body.id);
    assert.equal(live?.status, 'ACTIVE');
    assert.deepEqual(live?.targets, ['K-001']);
  });

  it('refuses to delete media used by a campaign', async () => {
    const result = await admin.delete('/api/admin/resources/media/media-festive-fashion');
    assert.equal(result.status, 409);
  });
});

describe('routing closures', () => {
  it('closes a corridor, publishes immediately and visitor routes recalculate around it', async () => {
    const before = await snapshot();
    const destination = before.tenants.find((t) => t.id === 'olive-trattoria')!.nodeId;
    const original = findRoute(
      before.nodes,
      before.edges,
      'l0-kiosk-k001',
      destination,
      false,
      before.floors,
    )!;
    const corridor = original.edges.find((e) => ['lift', 'escalator', 'stairs'].includes(e.type))!;
    const closed = await admin.post('/api/admin/routing/closures', {
      edgeId: corridor.id,
      closed: true,
      reason: 'Floor cleaning',
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.ok(closed.body.publishedVersion);

    const after = await snapshot();
    assert.equal(after.edges.find((e) => e.id === corridor.id)?.active, false);
    const detour = findRoute(
      after.nodes,
      after.edges,
      'l0-kiosk-k001',
      destination,
      false,
      after.floors,
    )!;
    assert.ok(detour);
    assert.ok(!detour.edges.some((e) => e.id === corridor.id));

    const preview = await admin.post('/api/admin/routing/preview', {
      fromNodeId: 'l0-kiosk-k001',
      toNodeId: destination,
      accessible: false,
    });
    assert.equal(preview.status, 200);
    assert.ok(!preview.body.route.edges.some((e: { id: string }) => e.id === corridor.id));

    await admin.post('/api/admin/routing/closures', { edgeId: corridor.id, closed: false });
    const validate = await admin.get('/api/admin/routing/validate');
    assert.equal(validate.body.ok, true, JSON.stringify(validate.body.issues));
  });
});

describe('QR route tokens', () => {
  it('issues a signed short-lived token that resolves to the same route request', async () => {
    const visitor = new Client(server.url);
    const issued = await visitor.post(
      '/api/route-tokens',
      {
        deviceId: 'K-001',
        startNodeId: 'l0-kiosk-k001',
        destinationId: 'olive-trattoria',
        accessible: true,
      },
      { csrf: false },
    );
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    assert.match(issued.body.url, /^http:\/\/phone\.test\/go\/r\//);
    const resolved = await visitor.get(`/api/route-tokens/${issued.body.token}`);
    assert.equal(resolved.status, 200);
    assert.deepEqual(
      {
        s: resolved.body.startNodeId,
        d: resolved.body.destinationId,
        a: resolved.body.accessible,
        k: resolved.body.destinationKind,
      },
      { s: 'l0-kiosk-k001', d: 'olive-trattoria', a: true, k: 'tenant' },
    );
  });

  it('rejects tampered, expired and unknown-destination tokens', async () => {
    const visitor = new Client(server.url);
    const issued = await visitor.post('/api/route-tokens', {
      startNodeId: 'l0-kiosk-k001',
      destinationId: 'zara',
      accessible: false,
    });
    const [body, signature] = issued.body.token.split('.');
    const tamperedBody = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), d: 'apple' }),
    ).toString('base64url');
    assert.equal((await visitor.get(`/api/route-tokens/${tamperedBody}.${signature}`)).status, 400);

    const expired = signRouteToken(
      server.context.routeTokenSecret,
      {
        venueId: 'riverside',
        startNodeId: 'l0-kiosk-k001',
        destinationId: 'zara',
        destinationKind: 'tenant',
        accessible: false,
        deviceId: '',
        ttlMinutes: 5,
      },
      Date.now() - 3600_000,
    );
    const expiredResult = await visitor.get(`/api/route-tokens/${expired.token}`);
    assert.equal(expiredResult.status, 410);
    assert.equal(expiredResult.body.error.code, 'expired');

    assert.equal(
      (
        await visitor.post('/api/route-tokens', {
          startNodeId: 'l0-kiosk-k001',
          destinationId: 'nowhere',
        })
      ).status,
      404,
    );
  });
});

describe('analytics pipeline', () => {
  it('ingests batches idempotently, rejects forged server events, and reports metrics', async () => {
    const visitor = new Client(server.url);
    const now = new Date().toISOString();
    const events = [
      {
        id: 'evt-test-0001',
        type: 'session_started',
        deviceId: 'K-001',
        sessionId: 's1',
        app: 'kiosk',
        occurredAt: now,
      },
      {
        id: 'evt-test-0002',
        type: 'search_submitted',
        deviceId: 'K-001',
        sessionId: 's1',
        app: 'kiosk',
        occurredAt: now,
        props: { query: 'Italian food', results: 3 },
      },
      {
        id: 'evt-test-0003',
        type: 'search_no_result',
        deviceId: 'K-001',
        sessionId: 's1',
        app: 'kiosk',
        occurredAt: now,
        props: { query: 'bookstore' },
      },
      {
        id: 'evt-test-0004',
        type: 'route_requested',
        deviceId: 'K-001',
        sessionId: 's1',
        app: 'kiosk',
        occurredAt: now,
        props: { destinationId: 'olive-trattoria', accessible: true },
      },
      {
        id: 'evt-test-0005',
        type: 'ad_started',
        deviceId: 'K-001',
        sessionId: '',
        app: 'kiosk',
        occurredAt: now,
        props: { campaignId: 'camp-festive-fashion' },
      },
      {
        id: 'evt-test-0006',
        type: 'qr_opened',
        deviceId: 'K-001',
        sessionId: '',
        app: 'kiosk',
        occurredAt: now,
      },
      { id: 'bad', type: 'not_an_event', occurredAt: now },
    ];
    const first = await visitor.post('/api/analytics', { events });
    assert.equal(first.status, 202);
    assert.equal(first.body.accepted, 5);
    assert.equal(first.body.rejected, 2);
    const retry = await visitor.post('/api/analytics', { events: events.slice(0, 2) });
    assert.equal(retry.body.accepted, 0, 'retries from the offline queue are de-duplicated');

    const summary = await admin.get('/api/admin/analytics?days=1');
    assert.equal(summary.status, 200);
    assert.ok(summary.body.totals.sessions >= 1);
    assert.ok(summary.body.totals.searches >= 1);
    assert.ok(summary.body.zeroResultTerms.some((t: { key: string }) => t.key === 'bookstore'));
    assert.ok(
      summary.body.topDestinations.some((t: { key: string }) => t.key === 'olive-trattoria'),
    );
    assert.ok(
      summary.body.campaigns.some(
        (c: { campaignId: string; impressions: number }) =>
          c.campaignId === 'camp-festive-fashion' && c.impressions >= 1,
      ),
    );
  });
});

describe('devices', () => {
  it('requires a device key for heartbeats and reports health', async () => {
    const kiosk = new Client(server.url);
    assert.equal(
      (await kiosk.post('/api/devices/K-002/heartbeat', { softwareVersion: '1.0.0' })).status,
      401,
    );
    const rotated = await admin.post('/api/admin/devices/K-002/rotate-key');
    assert.equal(rotated.status, 200);
    assert.match(rotated.body.provisioningUrl, /device=K-002&key=/);
    const latest = await snapshot();
    const beat = await kiosk.post(
      '/api/devices/K-002/heartbeat',
      { softwareVersion: '1.0.0', contentVersion: latest.version, status: { online: true } },
      { headers: { 'x-device-key': rotated.body.key } },
    );
    assert.equal(beat.status, 200);
    assert.equal(beat.body.config.idleTimeout, 10);
    const runtime = await admin.get('/api/admin/devices/runtime');
    assert.equal(runtime.body.find((d: { id: string }) => d.id === 'K-002').health, 'online');
  });

  it('changes the idle timeout for every kiosk from one setting', async () => {
    const result = await admin.post('/api/admin/devices/idle-timeout', { seconds: 15 });
    assert.equal(result.status, 200);
    await admin.post('/api/admin/publish', {});
    assert.ok((await snapshot()).devices.every((d) => d.idleTimeout === 15));
    await admin.post('/api/admin/devices/idle-timeout', { seconds: 10 });
    await admin.post('/api/admin/publish', {});
    assert.equal((await admin.post('/api/admin/devices/idle-timeout', { seconds: 3 })).status, 400);
  });
});

describe('media uploads', () => {
  it('rejects files whose content is not an allowed image/video, whatever the extension', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }),
      'evil.png',
    );
    const result = await admin.post('/api/admin/media/upload', form);
    assert.equal(result.status, 400);
  });

  it('accepts a real image, re-encodes it to WebP and serves it', async () => {
    const png = await sharp({
      create: { width: 64, height: 32, channels: 3, background: '#1a5cff' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'banner.png');
    const result = await admin.post('/api/admin/media/upload', form);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.mimeType, 'image/webp');
    assert.equal(result.body.width, 64);
    const served = await fetch(`${server.url}${result.body.url}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await admin.delete(`/api/admin/resources/media/${result.body.id}`)).status, 200);
  });
});

describe('user safety rules', () => {
  it('prevents deleting yourself or the last super admin', async () => {
    const me = await admin.get('/api/auth/me');
    assert.equal((await admin.delete(`/api/admin/users/${me.body.user.id}`)).status, 409);
    assert.equal(
      (await admin.put(`/api/admin/users/${me.body.user.id}`, { role: 'ANALYST' })).status,
      409,
    );
  });

  it('never returns password hashes', async () => {
    const users = await admin.get('/api/admin/users');
    assert.ok(
      users.body.every(
        (u: Record<string, unknown>) => !('passwordHash' in u) && !('password_hash' in u),
      ),
    );
  });
});

describe('public configuration', () => {
  it('exposes kiosk settings and the deployed client build without secrets', async () => {
    const config = await new Client(server.url).get('/api/config');
    assert.equal(config.status, 200);
    assert.ok(
      config.body.clientBuild === null || /^\/assets\/.+\.js$/.test(config.body.clientBuild),
    );
    assert.equal(typeof config.body.qrTokenTtlMinutes, 'number');
    const text = JSON.stringify(config.body).toLowerCase();
    for (const secret of ['secret', 'password', 'service_role', 'database'])
      assert.ok(!text.includes(secret), `config must not mention ${secret}`);
  });
});

describe('safe errors', () => {
  it('returns JSON errors without stack traces', async () => {
    const result = await admin.post('/api/admin/resources/nonsense', {});
    assert.equal(result.status, 404);
    assert.ok(!JSON.stringify(result.body).includes('at '));
    const malformed = await fetch(`${server.url}/api/analytics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    assert.equal(malformed.status, 400);
  });
});
