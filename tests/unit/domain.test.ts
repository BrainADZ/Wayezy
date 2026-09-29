import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canDo,
  dailyHours,
  openState,
  roles,
  schemas,
  type ContentResource,
} from '../../packages/domain';
import { demo } from '../../packages/domain/seed';

describe('demo data set', () => {
  it('validates every record against the domain schemas', () => {
    const check = <T>(
      name: string,
      schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
      items: T[],
    ) => {
      for (const item of items) {
        const result = schema.safeParse(item);
        assert.ok(
          result.success,
          `${name} ${(item as { id?: string }).id}: ${JSON.stringify((result as { error?: { issues?: unknown } }).error?.issues)}`,
        );
      }
    };
    check('venue', schemas.venue, [demo.venue]);
    check('floor', schemas.floors, demo.floors);
    check('category', schemas.categories, demo.categories);
    check('feature', schemas.features, demo.features);
    check('node', schemas.nodes, demo.nodes);
    check('edge', schemas.edges, demo.edges);
    check('connector', schemas.connectors, demo.connectors);
    check('tenant', schemas.tenants, demo.tenants);
    check('poi', schemas.pois, demo.pois);
    check('offer', schemas.offers, demo.offers);
    check('event', schemas.events, demo.events);
    check('campaign', schemas.campaigns, demo.campaigns);
    check('device', schemas.devices, demo.devices);
    check('media', schemas.media, demo.media);
  });

  it('matches the target mall size', () => {
    const perFloor = (id: string) => demo.tenants.filter((t) => t.floorId === id).length;
    assert.ok(
      demo.tenants.length >= 30 && demo.tenants.length <= 40,
      `${demo.tenants.length} tenants`,
    );
    assert.ok(perFloor('l0') >= 10 && perFloor('l0') <= 12);
    assert.ok(perFloor('l1') >= 14 && perFloor('l1') <= 16);
    assert.ok(perFloor('l2') >= 10 && perFloor('l2') <= 14);
    assert.equal(demo.floors.length, 3);
    assert.equal(demo.devices.length, 4);
    assert.equal(demo.offers.length, 10);
    assert.equal(demo.events.length, 3);
    assert.equal(demo.campaigns.length, 4);
    assert.equal(demo.pois.filter((p) => p.type === 'ATM').length, 3);
    assert.ok(
      demo.pois.filter((p) => p.type === 'Washroom' || p.type === 'AccessibleWashroom').length >= 6,
    );
  });

  it('links every tenant to a real node and map feature on its floor', () => {
    for (const t of demo.tenants) {
      const node = demo.nodes.find((n) => n.id === t.nodeId);
      const feature = demo.features.find((f) => f.id === t.featureId);
      assert.ok(node && node.floorId === t.floorId, `${t.id} node`);
      assert.ok(feature && feature.floorId === t.floorId, `${t.id} feature`);
    }
    for (const p of demo.pois)
      assert.ok(
        demo.nodes.some((n) => n.id === p.nodeId && n.floorId === p.floorId),
        `${p.id} node`,
      );
    for (const d of demo.devices)
      assert.ok(
        demo.nodes.some((n) => n.id === d.routeStartNode && n.type === 'kiosk'),
        `${d.id} start node`,
      );
  });

  it('keeps shared structure aligned across floors', () => {
    for (const connector of demo.connectors) {
      const nodes = connector.nodeIds.map((id) => demo.nodes.find((n) => n.id === id)!);
      assert.equal(nodes.length, 3);
      assert.ok(
        nodes.every((n) => n.x === nodes[0].x && n.y === nodes[0].y),
        `${connector.id} is vertically aligned`,
      );
    }
  });
});

describe('opening hours', () => {
  const hours = dailyHours('10:00', '22:00');
  it('computes open, closing soon and closed states in the venue timezone', () => {
    assert.equal(
      openState({ status: 'ACTIVE', hours }, new Date('2026-09-17T06:30:00Z')).state,
      'open',
    ); // 12:00 IST
    const soon = openState({ status: 'ACTIVE', hours }, new Date('2026-09-17T16:15:00Z')); // 21:45 IST
    assert.equal(soon.state, 'open');
    assert.equal(soon.state === 'open' && soon.closingSoon, true);
    const early = openState({ status: 'ACTIVE', hours }, new Date('2026-09-17T02:30:00Z')); // 08:00 IST
    assert.deepEqual(early, { state: 'closed', opensAt: '10:00' });
  });
  it('handles overnight hours and closure statuses', () => {
    const cinema = dailyHours('09:30', '01:00');
    assert.equal(
      openState({ status: 'ACTIVE', hours: cinema }, new Date('2026-09-17T19:00:00Z')).state,
      'open',
    ); // 00:30 IST
    assert.equal(
      openState({ status: 'TEMPORARILY_CLOSED', hours }, new Date('2026-09-17T06:30:00Z')).state,
      'temporarily-closed',
    );
  });
});

describe('role-based permissions', () => {
  it('grants super admins everything', () => {
    assert.ok(canDo('SUPER_ADMIN', 'users', 'write'));
    assert.ok(canDo('SUPER_ADMIN', 'tenants', 'write'));
  });
  it('limits each role to its responsibilities', () => {
    const writes = (
      role: (typeof roles)[number],
      resource: ContentResource | 'users' | 'settings',
    ) => canDo(role, resource, 'write');
    assert.ok(writes('CONTENT_MANAGER', 'tenants'));
    assert.ok(!writes('CONTENT_MANAGER', 'campaigns'));
    assert.ok(!writes('CONTENT_MANAGER', 'edges'));
    assert.ok(writes('ADVERTISING_MANAGER', 'campaigns'));
    assert.ok(!writes('ADVERTISING_MANAGER', 'tenants'));
    assert.ok(!writes('ANALYST', 'tenants'));
    assert.ok(canDo('ANALYST', 'analytics', 'read'));
    assert.ok(!canDo('ANALYST', 'tenants', 'publish'));
    assert.ok(writes('DEVICE_OPERATOR', 'devices'));
    assert.ok(!writes('DEVICE_OPERATOR', 'tenants'));
    assert.ok(writes('MALL_ADMIN', 'edges'));
    assert.ok(!writes('MALL_ADMIN', 'users'));
    assert.ok(!canDo('CONTENT_MANAGER', 'users', 'read'));
  });
});
