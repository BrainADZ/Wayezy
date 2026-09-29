import type { RouteEdge, RouteNode } from '../index';
import { METRES_PER_UNIT, RING, type Pt } from './layout';

/**
 * Builds the walkable corridor graph for one floor.
 *
 * The corridor centre-line is a chamfered ring. Every destination (shop door, amenity,
 * connector landing, kiosk) is projected perpendicularly onto the nearest ring segment;
 * the projection becomes a ring node and a short spur edge links it to the destination.
 * Consecutive nodes along each segment are then chained, so routes follow corridors
 * instead of cutting through units.
 */
export const WALKING_SPEED_MPS = 1.3;

const c = RING.chamfer;
export const RING_POINTS: Pt[] = [
  [RING.left + c, RING.top],
  [RING.right - c, RING.top],
  [RING.right, RING.top + c],
  [RING.right, RING.bottom - c],
  [RING.right - c, RING.bottom],
  [RING.left + c, RING.bottom],
  [RING.left, RING.bottom - c],
  [RING.left, RING.top + c],
];

export interface Attachment {
  id: string;
  point: Pt;
  label: string;
  type: RouteNode['type'];
  /** Attach to another attachment instead of the ring (e.g. entrance → kiosk). */
  via?: string;
  landmark?: boolean;
  connectorId?: string;
  edgeType?: RouteEdge['type'];
}

export const metres = (a: Pt, b: Pt) =>
  Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * METRES_PER_UNIT * 10) / 10;

export function walkEdge(
  id: string,
  from: string,
  to: string,
  distance: number,
  type: RouteEdge['type'] = 'corridor',
): RouteEdge {
  const d = Math.max(0.5, distance);
  return {
    id,
    fromNode: from,
    toNode: to,
    distance: d,
    type,
    weight: 1,
    direction: 'BOTH',
    active: true,
    accessible: true,
    restricted: false,
    estimatedTime: Math.max(1, Math.round((d / WALKING_SPEED_MPS) * 10) / 10),
    reason: '',
  };
}

function projectOnSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  const point: Pt = [Math.round((a[0] + t * dx) * 10) / 10, Math.round((a[1] + t * dy) * 10) / 10];
  return { t, point, distance: Math.hypot(p[0] - point[0], p[1] - point[1]) };
}

export function buildFloorGraph(floorId: string, attachments: Attachment[]) {
  const nodes: RouteNode[] = [];
  const edges: RouteEdge[] = [];
  const segments = RING_POINTS.map((a, i) => ({
    a,
    b: RING_POINTS[(i + 1) % RING_POINTS.length],
    stops: [] as { t: number; id: string }[],
  }));
  const nodeAt = new Map<string, RouteNode>();

  const addNode = (node: RouteNode) => {
    nodes.push(node);
    nodeAt.set(node.id, node);
    return node;
  };

  // Ring vertices.
  RING_POINTS.forEach((p, i) => {
    const id = `${floorId}-ring-v${i}`;
    addNode({
      id,
      floorId,
      x: p[0],
      y: p[1],
      label: 'Corridor',
      type: 'corridor',
      connectorId: '',
      landmark: false,
    });
    segments[i].stops.push({ t: 0, id });
    segments[(i + RING_POINTS.length - 1) % RING_POINTS.length].stops.push({ t: 1, id });
  });

  let ringCounter = 0;
  const ringNodeFor = (point: Pt) => {
    let best = { index: 0, ...projectOnSegment(point, segments[0].a, segments[0].b) };
    segments.forEach((segment, index) => {
      const projection = projectOnSegment(point, segment.a, segment.b);
      if (projection.distance < best.distance - 0.01) best = { index, ...projection };
    });
    const segment = segments[best.index];
    const existing = segment.stops.find((stop) => {
      const n = nodeAt.get(stop.id)!;
      return Math.hypot(n.x - best.point[0], n.y - best.point[1]) < 8;
    });
    if (existing) return nodeAt.get(existing.id)!;
    const node = addNode({
      id: `${floorId}-ring-${++ringCounter}`,
      floorId,
      x: best.point[0],
      y: best.point[1],
      label: 'Corridor',
      type: 'corridor',
      connectorId: '',
      landmark: false,
    });
    segment.stops.push({ t: best.t, id: node.id });
    return node;
  };

  for (const attachment of attachments) {
    addNode({
      id: attachment.id,
      floorId,
      x: attachment.point[0],
      y: attachment.point[1],
      label: attachment.label,
      type: attachment.type,
      connectorId: attachment.connectorId ?? '',
      landmark: attachment.landmark ?? false,
    });
  }
  for (const attachment of attachments) {
    const target = attachment.via ? nodeAt.get(attachment.via)! : ringNodeFor(attachment.point);
    edges.push(
      walkEdge(
        `${floorId}-e-${attachment.id.replace(`${floorId}-`, '')}`,
        target.id,
        attachment.id,
        metres(attachment.point, [target.x, target.y]),
        attachment.edgeType,
      ),
    );
  }

  // Chain ring nodes along each segment in order.
  let ringEdge = 0;
  for (const segment of segments) {
    const ordered = [...segment.stops].sort((a, b) => a.t - b.t);
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = nodeAt.get(ordered[i].id)!;
      const to = nodeAt.get(ordered[i + 1].id)!;
      if (from.id === to.id) continue;
      edges.push(
        walkEdge(
          `${floorId}-ring-e${++ringEdge}`,
          from.id,
          to.id,
          metres([from.x, from.y], [to.x, to.y]),
        ),
      );
    }
  }
  return { nodes, edges };
}
