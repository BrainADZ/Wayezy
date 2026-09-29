import type {
  Floor,
  Route,
  RouteEdge,
  RouteFloorTransition,
  RouteNode,
  RouteStep,
} from '../domain';

/**
 * WAY EZY route engine.
 *
 * A* over a weighted, multi-floor graph. Edge cost = estimatedTime (seconds) × weight, so
 * standard routes optimise travel time (lifts carry their waiting time). Accessible routes
 * drop stairs, escalators and any edge not flagged accessible. Closed (inactive) and
 * restricted edges are always excluded.
 *
 * Heuristic: straight-line 3D distance (metres, 5 m per level) × the smallest cost-per-metre
 * found on any eligible edge. Because every edge costs at least that ratio times its own
 * geometric length, the estimate never exceeds the true remaining cost (admissible), and it
 * stays admissible after admins edit the graph.
 */
const LEVEL_HEIGHT_M = 5;

interface Adjacent {
  node: string;
  edge: RouteEdge;
}

export function isEdgeEligible(edge: RouteEdge, accessible: boolean) {
  if (!edge.active || edge.restricted) return false;
  if (!accessible) return true;
  return edge.accessible && edge.type !== 'stairs' && edge.type !== 'escalator';
}

function buildAdjacency(nodes: RouteNode[], edges: RouteEdge[], accessible: boolean) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adjacent = new Map<string, Adjacent[]>();
  const push = (from: string, item: Adjacent) => {
    const list = adjacent.get(from);
    if (list) list.push(item);
    else adjacent.set(from, [item]);
  };
  for (const edge of edges) {
    if (!isEdgeEligible(edge, accessible)) continue;
    if (!byId.has(edge.fromNode) || !byId.has(edge.toNode)) continue;
    push(edge.fromNode, { node: edge.toNode, edge });
    if (edge.direction === 'BOTH') push(edge.toNode, { node: edge.fromNode, edge });
  }
  return { byId, adjacent };
}

/** Minimal binary heap keyed by priority. */
class MinHeap<T> {
  private items: { key: number; value: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(key: number, value: T) {
    const items = this.items;
    items.push({ key, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].key <= items[i].key) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop(): T | undefined {
    const items = this.items;
    if (!items.length) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].key < items[smallest].key) smallest = l;
        if (r < items.length && items[r].key < items[smallest].key) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top.value;
  }
}

function levelOf(floors: Floor[], floorId: string) {
  return floors.find((f) => f.id === floorId)?.level ?? 0;
}
function scaleOf(floors: Floor[], floorId: string) {
  return floors.find((f) => f.id === floorId)?.metresPerUnit ?? 1;
}

function geometricMetres(a: RouteNode, b: RouteNode, floors: Floor[]) {
  const scale = scaleOf(floors, a.floorId);
  return Math.hypot(
    (a.x - b.x) * scale,
    (a.y - b.y) * scale,
    (levelOf(floors, a.floorId) - levelOf(floors, b.floorId)) * LEVEL_HEIGHT_M,
  );
}

export const edgeCost = (edge: RouteEdge) => edge.estimatedTime * edge.weight;

export function findRoute(
  nodes: RouteNode[],
  edges: RouteEdge[],
  origin: string,
  destination: string,
  accessible = false,
  floors: Floor[] = [],
): Route | null {
  const { byId, adjacent } = buildAdjacency(nodes, edges, accessible);
  const start = byId.get(origin);
  const goal = byId.get(destination);
  if (!start || !goal) return null;
  if (origin === destination) {
    return {
      nodes: [goal],
      edges: [],
      distance: 0,
      seconds: 0,
      minutes: 0,
      steps: [
        {
          text: `You are at ${goal.label}.`,
          floorId: goal.floorId,
          nodeId: goal.id,
          distance: 0,
          connector: false,
          kind: 'arrive',
        },
      ],
      floorIds: [goal.floorId],
      transitions: [],
      accessible,
    };
  }

  let ratio = Infinity;
  for (const list of adjacent.values()) {
    for (const { edge } of list) {
      const d = geometricMetres(byId.get(edge.fromNode)!, byId.get(edge.toNode)!, floors);
      if (d > 0.01) ratio = Math.min(ratio, edgeCost(edge) / d);
    }
  }
  if (!Number.isFinite(ratio)) ratio = 0;
  const heuristic = (node: RouteNode) => geometricMetres(node, goal, floors) * ratio;

  const cost = new Map<string, number>([[origin, 0]]);
  const previous = new Map<string, Adjacent>();
  const closed = new Set<string>();
  const open = new MinHeap<string>();
  open.push(heuristic(start), origin);

  while (open.size) {
    const current = open.pop()!;
    if (closed.has(current)) continue;
    if (current === destination)
      return assembleRoute(byId, previous, origin, destination, edges, floors, accessible);
    closed.add(current);
    const base = cost.get(current)!;
    for (const next of adjacent.get(current) ?? []) {
      if (closed.has(next.node)) continue;
      const candidate = base + edgeCost(next.edge);
      if (candidate < (cost.get(next.node) ?? Infinity)) {
        cost.set(next.node, candidate);
        previous.set(next.node, { node: current, edge: next.edge });
        open.push(candidate + heuristic(byId.get(next.node)!), next.node);
      }
    }
  }
  return null;
}

/** Single-source travel costs (seconds) — used to pick the nearest amenity of a type. */
export function travelCosts(
  nodes: RouteNode[],
  edges: RouteEdge[],
  origin: string,
  accessible = false,
) {
  const { adjacent } = buildAdjacency(nodes, edges, accessible);
  const cost = new Map<string, number>([[origin, 0]]);
  const heap = new MinHeap<string>();
  const done = new Set<string>();
  heap.push(0, origin);
  while (heap.size) {
    const current = heap.pop()!;
    if (done.has(current)) continue;
    done.add(current);
    for (const next of adjacent.get(current) ?? []) {
      const candidate = cost.get(current)! + edgeCost(next.edge);
      if (candidate < (cost.get(next.node) ?? Infinity)) {
        cost.set(next.node, candidate);
        heap.push(candidate, next.node);
      }
    }
  }
  return cost;
}

export function nearestByCost<T extends { nodeId: string }>(
  candidates: T[],
  costs: Map<string, number>,
): T | null {
  let best: T | null = null;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const c = costs.get(candidate.nodeId);
    if (c !== undefined && c < bestCost) {
      best = candidate;
      bestCost = c;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Route assembly + human instructions                                 */
/* ------------------------------------------------------------------ */

function assembleRoute(
  byId: Map<string, RouteNode>,
  previous: Map<string, Adjacent>,
  origin: string,
  destination: string,
  allEdges: RouteEdge[],
  floors: Floor[],
  accessible: boolean,
): Route {
  const routeNodes: RouteNode[] = [byId.get(destination)!];
  const routeEdges: RouteEdge[] = [];
  let cursor = destination;
  while (cursor !== origin) {
    const prev = previous.get(cursor)!;
    routeEdges.unshift(prev.edge);
    routeNodes.unshift(byId.get(prev.node)!);
    cursor = prev.node;
  }
  const transitions: RouteFloorTransition[] = [];
  routeEdges.forEach((edge, i) => {
    const a = routeNodes[i];
    const b = routeNodes[i + 1];
    if (a.floorId !== b.floorId)
      transitions.push({
        fromFloorId: a.floorId,
        toFloorId: b.floorId,
        type: edge.type,
        fromNodeId: a.id,
        toNodeId: b.id,
      });
  });
  const seconds = Math.round(routeEdges.reduce((s, e) => s + e.estimatedTime, 0));
  return {
    nodes: routeNodes,
    edges: routeEdges,
    distance: Math.round(routeEdges.reduce((s, e) => s + e.distance, 0)),
    seconds,
    minutes: Math.max(1, Math.ceil(seconds / 60)),
    steps: buildSteps(routeNodes, routeEdges, byId, allEdges, floors),
    floorIds: [...new Set(routeNodes.map((n) => n.floorId))],
    transitions,
    accessible,
  };
}

const roundDistance = (m: number) => (m >= 20 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m)));

function floorLabel(floors: Floor[], floorId: string) {
  const floor = floors.find((f) => f.id === floorId);
  if (!floor) return floorId;
  return floor.theme ? `${floor.shortName} · ${floor.theme}` : floor.name;
}

function buildSteps(
  path: RouteNode[],
  pathEdges: RouteEdge[],
  byId: Map<string, RouteNode>,
  allEdges: RouteEdge[],
  floors: Floor[],
): RouteStep[] {
  const destination = path[path.length - 1];
  const onPath = new Set(path.map((n) => n.id));

  // Nearby named places (shops, amenities, connectors) give instructions a landmark.
  const landmarkNear = (node: RouteNode): string | null => {
    if (node.type !== 'corridor' && node.type !== 'kiosk' && node.id !== destination.id)
      return node.label;
    let best: { label: string; score: number } | null = null;
    for (const edge of allEdges) {
      if (edge.type !== 'corridor' || edge.distance > 12) continue;
      const otherId =
        edge.fromNode === node.id ? edge.toNode : edge.toNode === node.id ? edge.fromNode : null;
      if (!otherId || onPath.has(otherId)) continue;
      const other = byId.get(otherId);
      if (!other || (other.type !== 'tenant' && other.type !== 'poi')) continue;
      const score = (other.landmark ? 100 : 0) + (other.type === 'tenant' ? 10 : 5) - edge.distance;
      if (!best || score > best.score) best = { label: other.label, score };
    }
    return best?.label ?? null;
  };

  const heading = (a: RouteNode, b: RouteNode) => Math.atan2(b.y - a.y, b.x - a.x);
  const turnKind = (from: number, to: number): RouteStep['kind'] => {
    let delta = ((to - from) * 180) / Math.PI;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    // Plan coordinates have y pointing down, so a positive angle is a clockwise (right) turn.
    if (Math.abs(delta) < 25) return 'straight';
    if (Math.abs(delta) < 55) return delta > 0 ? 'slight-right' : 'slight-left';
    return delta > 0 ? 'right' : 'left';
  };

  const steps: RouteStep[] = [];
  let i = 0;
  let lastHeading: number | null = null;
  const finalSpur =
    pathEdges.length > 1 &&
    pathEdges[pathEdges.length - 1].distance < 12 &&
    pathEdges[pathEdges.length - 1].type !== 'lift';

  while (i < pathEdges.length) {
    const edge = pathEdges[i];
    const a = path[i];
    const b = path[i + 1];

    if (a.floorId !== b.floorId) {
      // Merge consecutive hops on the same connector (e.g. escalator L0→L1→L2).
      let j = i;
      while (
        j + 1 < pathEdges.length &&
        path[j + 1].floorId !== path[j + 2].floorId &&
        pathEdges[j + 1].type === edge.type
      )
        j++;
      const target = path[j + 1];
      const up = levelOf(floors, target.floorId) > levelOf(floors, a.floorId);
      const noun =
        edge.type === 'lift'
          ? 'lift'
          : edge.type === 'escalator'
            ? 'escalator'
            : edge.type === 'stairs'
              ? 'stairs'
              : edge.type;
      const verb =
        edge.type === 'lift' ? `Take the ${noun}` : `Take the ${noun} ${up ? 'up' : 'down'}`;
      steps.push({
        text: `${verb} to ${floorLabel(floors, target.floorId)}.`,
        floorId: a.floorId,
        toFloorId: target.floorId,
        nodeId: target.id,
        distance: pathEdges.slice(i, j + 1).reduce((s, e) => s + e.distance, 0),
        connector: true,
        kind:
          edge.type === 'lift'
            ? 'lift'
            : edge.type === 'escalator'
              ? 'escalator'
              : edge.type === 'ramp'
                ? 'ramp'
                : 'stairs',
      });
      lastHeading = null;
      i = j + 1;
      continue;
    }

    const isFinalSpur = finalSpur && i === pathEdges.length - 1 && steps.length > 0;
    if (isFinalSpur) break;

    // Walk forward while the dominant heading stays roughly straight. Short segments (corridor
    // chamfers, door spurs < 6 m) never start a new instruction on their own.
    const TINY = 6;
    let dominant = { heading: heading(a, b), length: edge.distance };
    let j = i;
    let distance = edge.distance;
    while (j + 1 < pathEdges.length) {
      const nextA = path[j + 1];
      const nextB = path[j + 2];
      if (nextA.floorId !== nextB.floorId) break;
      if (finalSpur && j + 1 === pathEdges.length - 1) break;
      const nextEdge = pathEdges[j + 1];
      const segmentHeading = heading(nextA, nextB);
      if (nextEdge.distance >= TINY && turnKind(dominant.heading, segmentHeading) !== 'straight') {
        if (dominant.length >= TINY) break;
        dominant = { heading: segmentHeading, length: nextEdge.distance };
      } else if (nextEdge.distance > dominant.length) {
        dominant = { heading: segmentHeading, length: nextEdge.distance };
      }
      distance += nextEdge.distance;
      j++;
    }
    const end = path[j + 1];
    const landmark = end.id === destination.id ? null : landmarkNear(end);
    const kind: RouteStep['kind'] =
      lastHeading === null ? 'start' : turnKind(lastHeading, dominant.heading);
    const metres = roundDistance(distance);
    const towards = landmark ? ` towards ${landmark}` : '';
    let text: string;
    if (kind === 'start')
      text =
        steps.length === 0
          ? `Walk ${metres} m${towards || ' along the corridor'}.`
          : `Walk ${metres} m${towards}.`;
    else if (kind === 'straight') text = `Continue straight for ${metres} m${towards}.`;
    else if (kind === 'left' || kind === 'right')
      text = `Turn ${kind} and walk ${metres} m${towards}.`;
    else text = `Bear ${kind === 'slight-left' ? 'left' : 'right'} and walk ${metres} m${towards}.`;
    if (end.id === destination.id) text = text.replace(/\.$/, ` to ${destination.label}.`);
    steps.push({ text, floorId: a.floorId, nodeId: end.id, distance, connector: false, kind });
    lastHeading = dominant.heading;
    i = j + 1;
  }

  // Arrival with side-of-corridor cue.
  let side = '';
  if (finalSpur && path.length >= 3) {
    const corridorFrom = path[path.length - 3];
    const corridorTo = path[path.length - 2];
    const door = destination;
    if (corridorFrom.floorId === door.floorId) {
      const cross =
        (corridorTo.x - corridorFrom.x) * (door.y - corridorTo.y) -
        (corridorTo.y - corridorFrom.y) * (door.x - corridorTo.x);
      side =
        Math.abs(cross) < 1 ? ' straight ahead' : cross > 0 ? ' on your right' : ' on your left';
    }
  }
  steps.push({
    text: side ? `${destination.label} is${side}.` : `You have arrived at ${destination.label}.`,
    floorId: destination.floorId,
    nodeId: destination.id,
    distance: finalSpur ? pathEdges[pathEdges.length - 1].distance : 0,
    connector: false,
    kind: 'arrive',
  });
  return steps;
}

/** Split a route into per-floor polylines (for renderers) in travel order. */
export function routeFloorSegments(route: Pick<Route, 'nodes'>) {
  const segments: { floorId: string; nodes: RouteNode[] }[] = [];
  for (const node of route.nodes) {
    const last = segments[segments.length - 1];
    if (last && last.floorId === node.floorId) last.nodes.push(node);
    else segments.push({ floorId: node.floorId, nodes: [node] });
  }
  return segments;
}

export function validateGraph(nodes: RouteNode[], edges: RouteEdge[]) {
  const issues: string[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!ids.has(e.fromNode) || !ids.has(e.toNode))
      issues.push(`Edge ${e.id} has a missing endpoint`);
    if (e.fromNode === e.toNode) issues.push(`Edge ${e.id} connects a node to itself`);
  }
  if (nodes.length) {
    // Treat active edges as undirected for connectivity: one-way escalators are paired with a return path.
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      if (!e.active || e.restricted || !ids.has(e.fromNode) || !ids.has(e.toNode)) continue;
      adjacency.set(e.fromNode, [...(adjacency.get(e.fromNode) ?? []), e.toNode]);
      adjacency.set(e.toNode, [...(adjacency.get(e.toNode) ?? []), e.fromNode]);
    }
    const seen = new Set([nodes[0].id]);
    const queue = [nodes[0].id];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const unreachable = nodes.filter((n) => !seen.has(n.id));
    if (unreachable.length)
      issues.push(
        `${unreachable.length} node${unreachable.length === 1 ? '' : 's'} cannot be reached from ${nodes[0].label}: ${unreachable
          .slice(0, 5)
          .map((n) => n.label || n.id)
          .join(', ')}${unreachable.length > 5 ? '…' : ''}`,
      );
  }
  return issues;
}
