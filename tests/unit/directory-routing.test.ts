import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import model from '../../packages/domain/reference/first-floor-model.json';
import groundModel from '../../packages/domain/reference/ground-floor-model.json';
import {
  directoryFloors,
  directoryRouteGraph,
  floorConnectors,
} from '../../packages/domain/reference/directory-route-graph';
import {
  firstRouteEdges,
  firstRouteNodes,
} from '../../packages/domain/reference/first-floor-route-graph';
import { findDirectoryRoute } from '../../packages/routing/ground-directory';
import { validateGraph } from '../../packages/routing';
import type { RouteEdge, RouteNode } from '../../packages/domain';
import { GroundRoute } from '../../apps/web/explorer/ground-route';

test('every First Floor brand is reachable from the Ground Floor entrance and back', () => {
  for (const tenant of model.tenants) {
    const id = `first-tenant-${tenant.id}`;
    const up = findDirectoryRoute('ground-entry-starbucks', id, false);
    assert.ok(up, tenant.id);
    assert.equal(up.nodes[0].id, 'ground-entry-starbucks');
    assert.equal(up.nodes.at(-1)!.id, id);
    assert.deepEqual(up.floorIds, ['l0', 'l1']);
    assert.equal(up.transitions.length, 1);
    assert.ok(['lift', 'escalator'].includes(up.transitions[0].type));
    const ride = up.steps.find((step) => step.connector)!;
    assert.match(ride.text, /^Take the (lift|escalator up) to First Floor\.$/);
    assert.equal(ride.floorId, 'l0');
    assert.equal(ride.toFloorId, 'l1');
    assert.ok(up.steps.every((step) => !/\d+ m\b/.test(step.text)));
    const down = findDirectoryRoute(id, 'ground-tenant-starbucks', false);
    assert.ok(down, tenant.id);
    assert.deepEqual(down.floorIds, ['l1', 'l0']);
    assert.match(
      down.steps.find((step) => step.connector)!.text,
      /^Take the (lift|escalator down) to Ground Floor\.$/,
    );
  }
});

test('floor links join the stacked lift and escalator banks of both drawings', () => {
  const { nodes, edges } = directoryRouteGraph();
  assert.deepEqual(validateGraph(nodes, edges), []);
  assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length);
  assert.equal(new Set(edges.map((edge) => edge.id)).size, edges.length);
  for (const connector of floorConnectors) {
    const ground = groundModel.amenities.find((a) => a.id === connector.ground.amenityId)!;
    const first = model.amenities.find((a) => a.id === connector.first.amenityId)!;
    assert.equal(ground.kind, connector.type);
    assert.equal(first.kind, connector.type);
    // The drawings differ by ~1.04 scale and an offset; stacked cores line up within a few units.
    const projected = [ground.point[0] * 1.037 + 121.4, ground.point[1] * 1.037 + 90.6];
    assert.ok(
      Math.hypot(projected[0] - first.point[0], projected[1] - first.point[1]) < 25,
      `${connector.id} does not stack`,
    );
    const link = edges.find((edge) => edge.id === `floor-link-${connector.id}`)!;
    assert.equal(link.type, connector.type);
  }
  // Escalators are preferred over waiting for a lift.
  assert.equal(
    findDirectoryRoute('ground-entry-starbucks', 'first-tenant-cinepolis', false)!.transitions[0]
      .type,
    'escalator',
  );
});

test('First Floor walkways avoid shop interiors and open voids', () => {
  const byId = new Map(firstRouteNodes.map((node) => [node.id, node]));
  const blocked = [
    ...model.displayModules.map((module) => module.labelBox),
    ...model.circulation.voids.map((area) => area.bounds),
  ];
  for (const edge of firstRouteEdges) {
    const a = byId.get(edge.fromNode)!,
      b = byId.get(edge.toNode)!;
    for (let i = 0; i <= 20; i++) {
      const x = a.x + ((b.x - a.x) * i) / 20,
        y = a.y + ((b.y - a.y) * i) / 20;
      assert.ok(
        blocked.every(
          (r) => x <= r.x + 1 || x >= r.x + r.width - 1 || y <= r.y + 1 || y >= r.y + r.height - 1,
        ),
        `${edge.id} crosses a shop or void at ${x},${y}`,
      );
    }
  }
});

test('closing a floor link reroutes, and accessible routes stay unverified', () => {
  const base = findDirectoryRoute('ground-entry-starbucks', 'first-tenant-cinepolis', false)!;
  const used = base.edges.find((edge) => edge.id.startsWith('floor-link-'))!;
  const detour = findDirectoryRoute('ground-entry-starbucks', 'first-tenant-cinepolis', false, [
    { ...used, active: false, reason: 'Maintenance' },
  ]);
  assert.ok(detour);
  assert.ok(!detour.edges.some((edge) => edge.id === used.id));
  assert.equal(findDirectoryRoute('ground-entry-starbucks', 'first-tenant-cinepolis', true), null);
  // Same-floor guidance still never leaves the floor.
  const ground = findDirectoryRoute('ground-entry-starbucks', 'ground-tenant-cafe-dori', false)!;
  assert.deepEqual(ground.floorIds, ['l0']);
});

test('first-floor admin entrance connections and split-corridor closures use the public graph', () => {
  const entrance = firstRouteNodes.find((node) => node.type === 'corridor')!;
  const custom: RouteNode = {
    ...entrance,
    id: 'first-custom-node-new-shop',
    x: entrance.x + 1,
    label: 'New shop entrance',
  };
  const edge: RouteEdge = {
    ...firstRouteEdges[0],
    id: 'first-custom-edge-new-shop',
    fromNode: entrance.id,
    toNode: custom.id,
    distance: 1,
    estimatedTime: 1,
  };
  const route = findDirectoryRoute('ground-entry-starbucks', custom.id, false, [edge], [custom]);
  assert.ok(route);
  assert.deepEqual(route.floorIds, ['l0', 'l1']);
  assert.equal(route.edges.at(-1)?.id, edge.id);
  const graph = directoryRouteGraph();
  const split = graph.edges.find(
    (edge) => edge.id.startsWith('master-walk-') && edge.id.endsWith('.a'),
  )!;
  assert.ok(split);
  const closed = directoryRouteGraph([{ ...split, active: false, reason: 'Maintenance' }]);
  assert.equal(closed.edges.find((edge) => edge.id === split.id)?.active, false);
  assert.equal(closed.edges.find((edge) => edge.id === split.id)?.reason, 'Maintenance');
});

test('the map draws only the shown floor of a multi-floor route', () => {
  const route = findDirectoryRoute('ground-entry-starbucks', 'first-tenant-greenr', false)!;
  const render = (floorId: string) =>
    renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(GroundRoute, { route, stepIndex: null, floorId, floors: directoryFloors }),
      ),
    );
  const ground = render('l0'),
    first = render('l1');
  const change = route.transitions[0];
  const at = (id: string) => route.nodes.find((node) => node.id === id)!;
  assert.match(ground, /data-floor-change="leave"/);
  assert.match(ground, /↑ First Floor/);
  assert.doesNotMatch(ground, /data-floor-change="arrive"/);
  assert.match(first, /From Ground Floor/);
  assert.ok(ground.includes(`translate(${at(change.fromNodeId).x} ${at(change.fromNodeId).y})`));
  assert.ok(first.includes(`translate(${at(change.toNodeId).x} ${at(change.toNodeId).y})`));
  for (const [markup, floorId] of [
    [ground, 'l0'],
    [first, 'l1'],
  ] as const) {
    const points = [...markup.matchAll(/class="directory-route-line" points="([^"]+)"/g)]
      .flatMap((match) => match[1].split(' '))
      .map((pair) => pair.split(',').map(Number));
    const expected = route.nodes.filter((node) => node.floorId === floorId);
    assert.deepEqual(
      points,
      expected.map((node) => [node.x, node.y]),
    );
  }
});
