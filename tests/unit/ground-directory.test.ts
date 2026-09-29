import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import prepared from '../../packages/domain/reference/ground-floor-prepared.json';
import graph from '../../packages/domain/reference/ground-floor-walks.json';
import tenants from '../../packages/domain/reference/ground-floor-tenants.json';
import { findGroundDirectoryRoute } from '../../packages/routing/ground-directory';
import {
  groundRouteEdges,
  groundRouteNodes,
} from '../../packages/domain/reference/ground-floor-route-graph';

test('prepared directory matches its source and cache version', () => {
  const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hash('public/maps/ground-floor-master.svg'), prepared.sourceSha256);
  assert.equal(hash('public/maps/ground-floor-directory.svg'), prepared.sha256);
  assert.ok(prepared.url.endsWith(prepared.sha256.slice(0, 12)));
  const svg = fs.readFileSync('public/maps/ground-floor-directory.svg');
  assert.deepEqual(
    brotliDecompressSync(fs.readFileSync('public/maps/ground-floor-directory.svg.br')),
    svg,
  );
  assert.deepEqual(gunzipSync(fs.readFileSync('public/maps/ground-floor-directory.svg.gz')), svg);
  assert.deepEqual(graph.warnings, [], 'Do not ship an obstructed corridor or frontage link');
});

test('source circulation connects confirmed storefronts and refuses unverified access', () => {
  for (const tenant of tenants.tenants) {
    const route = findGroundDirectoryRoute(
      'ground-entry-starbucks',
      `ground-tenant-${tenant.id}`,
      false,
    );
    if (tenant.id === 'soulfoods') {
      assert.equal(route, null);
      continue;
    }
    assert.ok(route, tenant.id);
    assert.equal(route.nodes[0].id, 'ground-entry-starbucks');
    assert.equal(route.nodes.at(-1)!.id, `ground-tenant-${tenant.id}`);
    assert.ok(
      route.steps.every((s) => !/\d+ m\b/.test(s.text)),
      'No uncalibrated distances in directions',
    );
  }
  assert.equal(
    findGroundDirectoryRoute('ground-entry-starbucks', 'ground-tenant-starbucks', true),
    null,
  );
  assert.equal(findGroundDirectoryRoute('missing', 'ground-tenant-starbucks', false), null);
});

test('admin-added ground nodes and connections become part of the kiosk route graph', () => {
  const start = groundRouteNodes.find((node) => node.id === 'ground-entry-starbucks')!;
  const node = {
    ...start,
    id: 'ground-custom-node-test',
    x: start.x + 8,
    label: 'New walkway',
    type: 'corridor' as const,
  };
  const edge = {
    ...groundRouteEdges[0],
    id: 'ground-custom-edge-test',
    fromNode: start.id,
    toNode: node.id,
    distance: 8,
    estimatedTime: 8,
  };
  assert.equal(
    findGroundDirectoryRoute(start.id, node.id, false, [edge], [node])?.nodes.at(-1)?.id,
    node.id,
  );
  assert.equal(
    findGroundDirectoryRoute(start.id, node.id, false, [{ ...edge, active: false }], [node]),
    null,
  );
});
