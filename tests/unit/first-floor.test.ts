import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createDemoSnapshot } from '../../packages/domain/seed';
import { schemas } from '../../packages/domain';
import { firstFloor, FIRST_FLOOR_SOURCE } from '../../packages/domain/reference/first-floor-layout';
import { groundPublicData } from '../../apps/web/explorer/ground-public-data';
import model from '../../packages/domain/reference/first-floor-model.json';
import prepared from '../../packages/domain/reference/first-floor-prepared.json';

test('public directory adds the supplied First Floor without unrelated demo geometry', () => {
  const source = createDemoSnapshot();
  const before = structuredClone(source);
  const directory = groundPublicData(source);
  assert.deepEqual(source, before);
  assert.deepEqual(
    directory.floors.map((floor) => floor.name),
    ['Ground Floor', 'First Floor'],
  );
  assert.deepEqual(schemas.floors.parse(firstFloor), firstFloor);
  const drawing = fs.readFileSync(`public${decodeURIComponent(FIRST_FLOOR_SOURCE)}`, 'utf8');
  assert.ok(drawing.includes(`viewBox="0 0 ${firstFloor.width} ${firstFloor.height}"`));
  for (const records of [directory.nodes, directory.features, directory.tenants, directory.pois])
    assert.ok(records.every((record) => ['l0', 'l1'].includes(record.floorId)));
  assert.equal(directory.tenants.filter((tenant) => tenant.floorId === 'l1').length, 20);
  assert.equal(directory.pois.filter((poi) => poi.floorId === 'l1').length, 17);
  assert.equal(directory.features.filter((feature) => feature.floorId === 'l1').length, 0);
  assert.ok(
    directory.tenants.some(
      (tenant) => tenant.id === 'first-tenant-greenr' && tenant.unitNumber === '12',
    ),
  );
  const nodes = new Set(directory.nodes.map((node) => node.id));
  assert.ok(directory.edges.every((edge) => nodes.has(edge.fromNode) && nodes.has(edge.toNode)));
});

test('cinema includes its left strip, keeps vacant stores separate, and preserves SKO and escalator', () => {
  for (const [id, units] of [
    ['cinepolis', ['module-cinema']],
    ['sko', ['module-17b1', 'module-17b2']],
  ] as const) {
    const tenantId = `first-tenant-${id}`;
    const tenant = model.tenants.find((tenant) => tenant.id === id)!;
    assert.deepEqual([...tenant.moduleIds].sort(), [...units].sort());
    const originalModules = model.modules.filter((module) =>
      units.some((unit) => unit === module.id),
    );
    assert.ok(originalModules.every((module) => module.tenantId === tenantId));
    const display = model.displayModules.filter((module) => module.tenantId === tenantId);
    assert.equal(display.length, 1);
    assert.deepEqual(
      [...display[0].sourceIds].sort(),
      originalModules.flatMap((module) => module.sourceIds).sort(),
    );
  }
  const cinema = model.modules.find((module) => module.id === 'module-cinema')!;
  assert.ok(cinema.sourceIds.includes('path3508'));
  for (const [id, sourceIds] of [
    ['module-22', ['path3505', 'path3506']],
    ['module-23', ['path3524']],
  ] as const) {
    const vacant = model.modules.find((module) => module.id === id)!;
    assert.equal('tenantId' in vacant, false);
    assert.deepEqual(vacant.sourceIds, [...sourceIds]);
    assert.ok(vacant.sourceIds.every((id) => !cinema.sourceIds.includes(id)));
    assert.ok(vacant.bounds.x + vacant.bounds.width <= cinema.labelBox.x);
  }
  const doors = model.doors.find((door) => door.id === 'first-cinema-entrance')!;
  assert.ok(doors.sourceIds.includes('path3937'));
  assert.ok(doors.sourceIds.includes('path4198'));
  assert.ok(
    model.amenities.some(
      (amenity) =>
        amenity.id === 'first-escalator-cinema' &&
        amenity.kind === 'escalator' &&
        amenity.point[0] === 662 &&
        amenity.point[1] === 1163,
    ),
  );
});

test('First Floor prepared directory stays tied to unique source paths and named source brands', () => {
  const source = fs.readFileSync(`public${decodeURIComponent(FIRST_FLOOR_SOURCE)}`);
  assert.equal(createHash('sha256').update(source).digest('hex'), model.sourceSha256);
  assert.equal(model.sourceSha256, prepared.sourceSha256);
  assert.equal(
    createHash('sha256')
      .update(fs.readFileSync('public/maps/first-floor-directory.svg'))
      .digest('hex'),
    prepared.sha256,
  );
  assert.equal(model.modules.length, 32);
  const sourceIds = model.modules.flatMap((module) => module.sourceIds);
  assert.equal(new Set(sourceIds).size, sourceIds.length);
  assert.ok(
    model.modules.every((module) => module.labelBox.width > 0 && module.labelBox.height > 0),
  );
  for (const tenant of model.tenants) {
    for (const id of tenant.moduleIds)
      assert.ok(
        model.modules.some(
          (module) => module.id === id && module.tenantId === `first-tenant-${tenant.id}`,
        ),
      );
    for (const id of tenant.sourceTextIds)
      assert.ok(source.toString('utf8').includes(`id="${id}"`));
    if (tenant.logo) assert.ok(fs.existsSync(`public${decodeURIComponent(tenant.logo)}`));
  }
});

test('First Floor circulation separates open voids and keeps entrances on source perimeters', () => {
  const circulation = model.circulation;
  assert.equal(circulation.voids.filter((area) => area.kind === 'courtyard').length, 3);
  assert.equal(circulation.voids.filter((area) => area.kind === 'atrium').length, 2);
  assert.ok(circulation.tileSourceIds.length > 700);
  const drawing = fs.readFileSync(`public${decodeURIComponent(FIRST_FLOOR_SOURCE)}`, 'utf8');
  for (const id of [
    ...circulation.tileSourceIds,
    ...circulation.edgeSourceIds,
    ...circulation.voids.flatMap((area) => area.sourceIds),
    ...circulation.openings.map((opening) => opening.sourceId),
  ])
    assert.ok(drawing.includes(`id="${id}"`), `Missing source path ${id}`);
  for (const module of ['module-14b', 'module-16b', 'module-12', 'module-3b', 'module-2a'])
    assert.ok(circulation.openings.some((opening) => opening.moduleId === module));
  for (const opening of circulation.openings) {
    assert.ok(model.displayModules.some((module) => module.id === opening.moduleId));
    assert.ok(opening.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    const p = {
      x: (opening.points[1].x + opening.points[2].x) / 2,
      y: (opening.points[1].y + opening.points[2].y) / 2,
    };
    assert.ok(
      circulation.voids.every(
        (area) =>
          p.x < area.bounds.x ||
          p.x > area.bounds.x + area.bounds.width ||
          p.y < area.bounds.y ||
          p.y > area.bounds.y + area.bounds.height,
      ),
      `Entrance ${opening.id} is inside an open void`,
    );
  }
});
