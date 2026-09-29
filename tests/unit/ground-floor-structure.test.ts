import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createDemoSnapshot } from '../../packages/domain/seed';
import { withGroundFloorStructure } from '../../packages/domain/reference/ground-floor-structure';
import model from '../../packages/domain/reference/ground-floor-model.json';
import bindings from '../../packages/domain/reference/ground-floor-tenants.json';
import { mediaPath } from '../../packages/domain';
import { groundRouteEdges } from '../../packages/domain/reference/ground-floor-route-graph';

test('corrected master model is current and uses unique original source IDs', () => {
  assert.equal(
    createHash('sha256')
      .update(fs.readFileSync('public/maps/ground-floor-master.svg'))
      .digest('hex'),
    model.sourceSha256,
    'Run npm run model:ground after changing the master.',
  );
  assert.equal(model.modules.length, 47);
  const assigned = model.modules.flatMap((m) => m.sourceIds);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.ok(
    model.modules.every((m) => m.sourceIds.length && m.labelBox.width > 0 && m.labelBox.height > 0),
  );
  for (const tenant of bindings.tenants)
    for (const id of tenant.moduleIds)
      assert.ok(
        model.modules.some((m) => m.id === id && m.tenantId === `ground-tenant-${tenant.id}`),
      );
});

test('module-based directory replaces legacy Ground Floor routes with source-validated walks', () => {
  const source = createDemoSnapshot(),
    before = structuredClone(source);
  const mapped = withGroundFloorStructure(source);
  assert.deepEqual(source, before);
  assert.equal(mapped.floors.find((f) => f.id === 'l0')?.height, 1455.8265);
  assert.deepEqual(
    mapped.tenants.filter((t) => t.floorId !== 'l0'),
    source.tenants.filter((t) => t.floorId !== 'l0'),
  );
  assert.equal(mapped.tenants.filter((t) => t.floorId === 'l0').length, 30);
  assert.equal(
    mapped.features.filter((t) => t.floorId === 'l0').length,
    0,
    'No synthetic shop geometry',
  );
  const legacyGroundIds = new Set(source.nodes.filter((n) => n.floorId === 'l0').map((n) => n.id));
  assert.ok(
    mapped.edges.every((e) => !legacyGroundIds.has(e.fromNode) && !legacyGroundIds.has(e.toNode)),
  );
  assert.equal(
    mapped.edges.filter((e) => e.id.startsWith('master-walk-')).length,
    groundRouteEdges.length,
  );
  assert.ok(mapped.nodes.some((n) => n.id === 'ground-entry-starbucks'));
  const closed = withGroundFloorStructure({
    ...source,
    edges: [...source.edges, { ...groundRouteEdges[25], active: false, reason: 'Cleaning' }],
  });
  assert.equal(closed.edges.find((e) => e.id === 'master-walk-25')?.active, false);
  assert.equal(mapped.tenants.find((t) => t.name === 'Love Birds')?.unitNumber, '14A / 14B');
  assert.equal(
    mapped.tenants.find((t) => t.name === 'Forest Essentials' && t.floorId === 'l0')?.unitNumber,
    '11A',
  );
  assert.equal(bindings.tenants.filter((t) => t.logo).length, 27);
  for (const tenant of bindings.tenants.filter((t) => t.logo)) {
    assert.equal(mediaPath.parse(tenant.logo), tenant.logo);
    assert.ok(fs.existsSync(`public${decodeURIComponent(tenant.logo)}`));
  }
  assert.equal(mediaPath.safeParse('/brand/logo/%2e%2e%2fsecret.png').success, false);
});
