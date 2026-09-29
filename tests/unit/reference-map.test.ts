import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoSnapshot } from '../../packages/domain/seed';
import { importReferenceLayout } from '../../packages/domain/reference/import-layout';
import { findRoute, validateGraph } from '../../packages/routing';

test('reference map preserves existing content and provides routes to every destination on all three floors', () => {
  const original = createDemoSnapshot();
  const data = importReferenceLayout(original);
  assert.equal(data.floors.length, 3);
  assert.deepEqual(data.devices, original.devices);
  assert.deepEqual(data.offers, original.offers);
  assert.deepEqual(data.campaigns, original.campaigns);
  for (const tenant of original.tenants)
    assert.deepEqual(
      data.tenants.find((t) => t.id === tenant.id),
      tenant,
    );
  assert.deepEqual(validateGraph(data.nodes, data.edges), []);
  for (const destination of [...data.tenants, ...data.pois]) {
    const route = findRoute(
      data.nodes,
      data.edges,
      data.devices[0].routeStartNode,
      destination.nodeId,
      false,
      data.floors,
    );
    assert.ok(route, `Missing route to ${destination.name}`);
  }
  const upper = data.tenants.find((t) => t.floorId === 'l2')!;
  const accessible = findRoute(
    data.nodes,
    data.edges,
    data.devices[0].routeStartNode,
    upper.nodeId,
    true,
    data.floors,
  );
  assert.ok(accessible);
  assert.ok(accessible.edges.some((e) => e.type === 'lift'));
  assert.ok(accessible.edges.every((e) => !['stairs', 'escalator'].includes(e.type)));
  assert.equal(original.floors.length, 3);
  assert.deepEqual(importReferenceLayout(data), data);
});
