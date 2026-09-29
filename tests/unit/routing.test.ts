import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDemoSnapshot, demo } from '../../packages/domain/seed';
import {
  findRoute,
  nearestByCost,
  routeFloorSegments,
  travelCosts,
  validateGraph,
} from '../../packages/routing';

const KIOSK = 'l0-kiosk-k001';
const route = (to: string, accessible = false, data = demo) =>
  findRoute(data.nodes, data.edges, KIOSK, to, accessible, data.floors);

describe('A* routing', () => {
  it('calculates a same-floor route with realistic time and a side-of-corridor arrival cue', () => {
    const r = route('l0-door-starbucks');
    assert.ok(r);
    assert.deepEqual(r.floorIds, ['l0']);
    assert.equal(r.transitions.length, 0);
    assert.ok(r.distance > 50 && r.distance < 150, `distance ${r.distance}`);
    assert.ok(r.minutes <= 2, `minutes ${r.minutes}`);
    assert.match(r.steps.at(-1)!.text, /Starbucks is on your (left|right)/);
  });

  it('prefers escalators for a standard multi-floor route', () => {
    const r = route('l2-door-olive-trattoria');
    assert.ok(r);
    assert.deepEqual(r.floorIds, ['l0', 'l1', 'l2']);
    assert.ok(r.transitions.every((t) => t.type === 'escalator'));
    const connectorSteps = r.steps.filter((s) => s.connector);
    assert.equal(connectorSteps.length, 1, 'consecutive escalator hops merge into one instruction');
    assert.match(connectorSteps[0].text, /Take the escalator up to L2/);
  });

  it('uses a lift and never stairs or escalators for an accessible route', () => {
    const r = route('l2-door-olive-trattoria', true);
    assert.ok(r);
    assert.equal(r.accessible, true);
    assert.ok(r.edges.every((e) => e.type !== 'stairs' && e.type !== 'escalator' && e.accessible));
    assert.ok(r.transitions.some((t) => t.type === 'lift'));
    assert.match(r.steps.find((s) => s.connector)!.text, /Take the lift to L2/);
  });

  it('respects one-way escalators (down journeys use down escalators)', () => {
    const r = findRoute(
      demo.nodes,
      demo.edges,
      'l2-kiosk-k004',
      'l0-door-decathlon',
      false,
      demo.floors,
    );
    assert.ok(r);
    for (const t of r.transitions.filter((x) => x.type === 'escalator'))
      assert.match(t.fromNodeId, /esc-[we]-down/);
  });

  it('reroutes around a closed corridor and fails cleanly when no path exists', () => {
    const data = createDemoSnapshot();
    const before = route('l0-door-starbucks', false, data)!;
    const corridor = before.edges.find((e) => e.type === 'corridor' && e.id.includes('ring'))!;
    corridor.active = false;
    const after = route('l0-door-starbucks', false, data)!;
    assert.ok(after, 'a detour exists');
    assert.ok(!after.edges.some((e) => e.id === corridor.id));
    assert.ok(after.distance > before.distance);

    // Close every edge into the Starbucks door: no route.
    for (const e of data.edges)
      if (e.toNode === 'l0-door-starbucks' || e.fromNode === 'l0-door-starbucks') e.active = false;
    assert.equal(route('l0-door-starbucks', false, data), null);
  });

  it('returns null for an accessible route when every step-free connector is closed', () => {
    const data = createDemoSnapshot();
    for (const e of data.edges) if (e.type === 'lift') e.active = false;
    assert.equal(route('l2-door-pvr', true, data), null);
    assert.ok(route('l2-door-pvr', false, data), 'standard route still works via escalators');
  });

  it('splits a route into per-floor segments in travel order', () => {
    const segments = routeFloorSegments(route('l2-door-olive-trattoria')!);
    assert.deepEqual(
      segments.map((s) => s.floorId),
      ['l0', 'l1', 'l2'],
    );
  });

  it('finds the nearest amenity by travel cost', () => {
    const costs = travelCosts(demo.nodes, demo.edges, KIOSK);
    const washrooms = demo.pois.filter((p) => p.type === 'Washroom');
    const nearest = nearestByCost(washrooms, costs);
    assert.equal(nearest?.floorId, 'l0');
  });

  it('keeps the demo graph fully connected', () => {
    assert.deepEqual(validateGraph(demo.nodes, demo.edges), []);
  });

  it('reports broken graph edits', () => {
    const data = createDemoSnapshot();
    data.edges.push({ ...data.edges[0], id: 'broken', toNode: 'missing-node' });
    data.nodes.push({ ...data.nodes[0], id: 'island', label: 'Island' });
    const issues = validateGraph(data.nodes, data.edges);
    assert.ok(issues.some((i) => i.includes('broken')));
    assert.ok(issues.some((i) => i.includes('cannot be reached')));
  });
});
