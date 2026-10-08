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

test('connected ground outlets share a complete footprint and one label per location', () => {
  const originals = model.modules.flatMap((module) => module.sourceIds).sort();
  const displayed = model.displayModules.flatMap((module) => module.sourceIds).sort();
  assert.deepEqual(displayed, originals);
  assert.equal(new Set(displayed).size, displayed.length);
  assert.equal(model.displayModules.length, 34);
  for (const [brand, units] of [
    ['soulfoods', ['module-9b', 'module-9c', 'module-9d', 'module-9e']],
    ['coyu', ['module-21a', 'module-21b', 'module-21d']],
    ['perona', ['module-9a1', 'module-9a2']],
    ['love-birds', ['module-14a', 'module-14b']],
    ['eka', ['module-17a', 'module-17b']],
    ['cafe-dori', ['module-2a', 'module-2b']],
    ['suvasa', ['module-10a', 'module-10b']],
    ['nykaa-luxe', ['module-7b', 'module-7c']],
  ] as const) {
    const tenantId = `ground-tenant-${brand}`;
    const outlet = model.displayModules.filter((module) => module.tenantId === tenantId);
    assert.equal(outlet.length, 1, brand);
    assert.deepEqual(
      outlet[0].sourceIds.slice().sort(),
      model.modules
        .filter((module) => units.some((unit) => unit === module.id))
        .flatMap((module) => module.sourceIds)
        .sort(),
    );
  }
  for (const [id, tenantId] of [
    ['module-21b', 'ground-tenant-coyu'],
    ['module-9a2', 'ground-tenant-perona'],
  ])
    assert.equal(model.modules.find((module) => module.id === id)!.tenantId, tenantId);
  const coyu = model.displayModules.find((module) => module.tenantId === 'ground-tenant-coyu')!;
  assert.deepEqual(
    coyu.labelBox,
    model.modules.find((module) => module.id === 'module-21a')!.labelBox,
  );
  for (const id of ['module-7a', 'module-8a', 'module-11d'])
    assert.equal(model.modules.find((module) => module.id === id)!.tenantId, undefined);
  const earth = model.displayModules.filter(
    (module) => module.tenantId === 'ground-tenant-good-earth',
  );
  assert.equal(earth.length, 2, 'Separate locations across the boulevard keep separate labels');
  assert.ok(
    earth.every((module) => module.labelBox.height > 100),
    'Each logo spans its adjoining bays',
  );
});

test('ground entrance highlights retain source recesses and the established pedestrian aisles', () => {
  const drawing = fs.readFileSync('public/maps/ground-floor-master.svg', 'utf8');
  assert.ok(model.circulation.openings.length >= 10);
  for (const entrance of model.circulation.openings) {
    assert.ok(drawing.includes(`id="${entrance.sourceId}"`));
    assert.ok(model.displayModules.some((module) => module.id === entrance.moduleId));
    assert.equal(entrance.points.length, 4);
    assert.ok(entrance.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  const circulation = JSON.parse(
    fs.readFileSync('packages/domain/reference/ground-floor-circulation.json', 'utf8'),
  );
  assert.deepEqual(
    model.circulation.walkways.map((walkway) => walkway.points.map(({ x, y }) => [x, y])),
    circulation.aisles,
  );
  assert.ok(
    model.circulation.forecourts.every(
      (court) => court.bounds.width > 0 && court.bounds.height > 0,
    ),
  );
});
