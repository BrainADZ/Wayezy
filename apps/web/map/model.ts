import type {
  Feature,
  Floor,
  Poi,
  Route,
  RouteNode,
  Snapshot,
  Tenant,
} from '../../../packages/domain';
import { categoryIcon, poiIcon } from '../icons/illustrated';

/**
 * Renderer-independent map model. Both the 3D (Three.js) and SVG renderers consume this, and
 * neither owns navigation: routes always come from the routing package's graph result.
 */
export type Pt = { x: number; y: number };

export interface MapFocus {
  key: string;
  floorId?: string;
  points: Pt[];
  /** Extra breathing room as a fraction of the box size. */
  padding?: number;
  /** Minimum box size in plan units (so a single shop is not zoomed absurdly close). */
  minSize?: number;
}

export interface UnitModel {
  feature: Feature;
  tenant: Tenant | null;
  pois: Poi[];
  centroid: Pt;
  area: number;
  /** 0 = always, 1 = default zoom, 2 = zoomed in, 3 = never auto. */
  priority: 0 | 1 | 2 | 3;
  label: string;
  icon: string | null;
  frontEdge: [Pt, Pt] | null;
}

export interface MarkerModel {
  id: string;
  kind: 'poi' | 'connector';
  x: number;
  y: number;
  icon: string;
  label: string;
  priority: 0 | 1 | 2;
  nodeIds: string[];
  poiIds: string[];
  featureId?: string;
}

export interface FloorModel {
  floor: Floor;
  units: UnitModel[];
  voids: Feature[];
  decor: Feature[];
  markers: MarkerModel[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function polygonArea(points: [number, number][]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function centroid(points: [number, number][]): Pt {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-6)
    return {
      x: points.reduce((s, p) => s + p[0], 0) / points.length,
      y: points.reduce((s, p) => s + p[1], 0) / points.length,
    };
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

/** Largest-inscribed-ish label point: centroid, nudged into the widest part of L-shaped units. */
export function labelPoint(points: [number, number][]): Pt {
  const c = centroid(points);
  if (pointInPolygon(c, points)) return c;
  let best = { x: points[0][0], y: points[0][1] };
  let bestDistance = -1;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  for (let i = 1; i < 12; i++) {
    for (let j = 1; j < 12; j++) {
      const candidate = { x: minX + ((maxX - minX) * i) / 12, y: minY + ((maxY - minY) * j) / 12 };
      if (!pointInPolygon(candidate, points)) continue;
      const d = distanceToEdges(candidate, points);
      if (d > bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
  }
  return best;
}

export function pointInPolygon(p: Pt, points: [number, number][]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToEdges(p: Pt, points: [number, number][]) {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
    min = Math.min(min, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)));
  }
  return min;
}

function nearestEdge(points: [number, number][], p: Pt): [Pt, Pt] | null {
  let best: [Pt, Pt] | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const d = Math.hypot(mx - p.x, my - p.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = [
        { x: ax, y: ay },
        { x: bx, y: by },
      ];
    }
  }
  return best;
}

const connectorLabels: Record<string, string> = {
  lift: 'Lift',
  escalator: 'Escalators',
  stairs: 'Stairs',
  ramp: 'Ramp',
};

export function buildFloorModel(data: Snapshot, floorId: string): FloorModel {
  const floor = data.floors.find((f) => f.id === floorId) ?? data.floors[0];
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const features = data.features.filter((f) => f.floorId === floor.id);
  const tenantsByFeature = new Map(
    data.tenants.filter((t) => t.floorId === floor.id).map((t) => [t.featureId, t]),
  );
  const floorPois = data.pois.filter((p) => p.floorId === floor.id);
  const categoriesById = new Map(data.categories.map((c) => [c.id, c]));

  const units: UnitModel[] = features
    .filter((f) => f.kind === 'unit' || f.kind === 'amenity' || f.kind === 'service')
    .map((feature) => {
      const tenant = tenantsByFeature.get(feature.id) ?? null;
      const pois = floorPois.filter((p) => p.featureId === feature.id);
      const area = polygonArea(feature.points);
      const doorNode = tenant
        ? nodes.get(tenant.nodeId)
        : pois[0]
          ? nodes.get(pois[0].nodeId)
          : null;
      const category = tenant ? categoriesById.get(tenant.categoryId) : null;
      const isMajor =
        Boolean(tenant?.anchor) ||
        tenant?.categoryId === 'cinema' ||
        tenant?.subcategory.toLowerCase().includes('food court');
      return {
        feature,
        tenant,
        pois,
        centroid: labelPoint(feature.points),
        area,
        priority: isMajor ? 1 : tenant ? 2 : feature.kind === 'service' ? 3 : 2,
        label: tenant?.name ?? feature.label,
        icon: category
          ? categoryIcon(category.icon)
          : pois[0]
            ? (poiIcon[pois[0].type] ?? null)
            : feature.kind === 'service'
              ? 'washroom'
              : null,
        frontEdge: doorNode ? nearestEdge(feature.points, { x: doorNode.x, y: doorNode.y }) : null,
      };
    });

  // Amenity markers grouped by node (washroom + accessible washroom share one marker).
  const markers: MarkerModel[] = [];
  const connectorTypes = new Set(['Lift', 'Escalator', 'Stairs']);
  const poiGroups = new Map<string, Poi[]>();
  for (const poi of floorPois) {
    if (connectorTypes.has(poi.type) || poi.featureId) continue;
    const list = poiGroups.get(poi.nodeId) ?? [];
    list.push(poi);
    poiGroups.set(poi.nodeId, list);
  }
  for (const [nodeId, pois] of poiGroups) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const primary =
      pois.find((p) => p.type !== 'AccessibleWashroom' && p.type !== 'FirstAid') ?? pois[0];
    markers.push({
      id: `poi-${nodeId}`,
      kind: 'poi',
      x: node.x,
      y: node.y,
      icon: poiIcon[primary.type] ?? 'information',
      label: primary.name,
      priority: ['Entrance', 'Information', 'Washroom', 'Parking', 'Taxi'].includes(primary.type)
        ? 1
        : 2,
      nodeIds: [nodeId],
      poiIds: pois.map((p) => p.id),
    });
  }
  // Vertical connectors grouped by proximity (escalator up/down pairs become one marker).
  const connectorNodes = data.nodes.filter(
    (n) =>
      n.floorId === floor.id &&
      (n.type === 'lift' || n.type === 'escalator' || n.type === 'stairs' || n.type === 'ramp'),
  );
  const used = new Set<string>();
  for (const node of connectorNodes) {
    if (used.has(node.id)) continue;
    const group = connectorNodes.filter(
      (other) =>
        other.type === node.type &&
        !used.has(other.id) &&
        Math.hypot(other.x - node.x, other.y - node.y) < 60,
    );
    group.forEach((g) => used.add(g.id));
    const x = group.reduce((s, n) => s + n.x, 0) / group.length;
    const y = group.reduce((s, n) => s + n.y, 0) / group.length;
    const pois = floorPois.filter((p) => group.some((g) => g.id === p.nodeId));
    markers.push({
      id: `connector-${node.id}`,
      kind: 'connector',
      x,
      y,
      icon: node.type === 'lift' ? 'lift' : node.type === 'escalator' ? 'escalator' : 'stairs',
      label: pois[0]?.name ?? connectorLabels[node.type],
      priority: node.type === 'stairs' ? 2 : 1,
      nodeIds: group.map((g) => g.id),
      poiIds: pois.map((p) => p.id),
    });
  }

  const xs = floor.outline.map((p) => p[0]);
  const ys = floor.outline.map((p) => p[1]);
  return {
    floor,
    units,
    voids: features.filter((f) => f.kind === 'void'),
    decor: features.filter((f) => f.kind === 'decor'),
    markers,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Route pieces                                                        */
/* ------------------------------------------------------------------ */

export type RoutePiece =
  | { kind: 'floor'; floorId: string; points: RouteNode[]; length: number }
  | {
      kind: 'vertical';
      fromFloorId: string;
      toFloorId: string;
      from: RouteNode;
      to: RouteNode;
      type: string;
      length: number;
    };

export function routePieces(route: Route | null | undefined, floors: Floor[]): RoutePiece[] {
  if (!route || route.nodes.length < 2) return [];
  const pieces: RoutePiece[] = [];
  let current: RouteNode[] = [route.nodes[0]];
  const mpu = (floorId: string) => floors.find((f) => f.id === floorId)?.metresPerUnit ?? 0.1;
  const flush = () => {
    if (current.length >= 2) {
      let length = 0;
      for (let i = 1; i < current.length; i++)
        length +=
          Math.hypot(current[i].x - current[i - 1].x, current[i].y - current[i - 1].y) *
          mpu(current[i].floorId);
      pieces.push({ kind: 'floor', floorId: current[0].floorId, points: current, length });
    }
  };
  for (let i = 1; i < route.nodes.length; i++) {
    const a = route.nodes[i - 1];
    const b = route.nodes[i];
    if (a.floorId !== b.floorId) {
      flush();
      pieces.push({
        kind: 'vertical',
        fromFloorId: a.floorId,
        toFloorId: b.floorId,
        from: a,
        to: b,
        type: route.edges[i - 1]?.type ?? 'lift',
        length: route.edges[i - 1]?.distance ?? 5,
      });
      current = [b];
    } else {
      current.push(b);
    }
  }
  flush();
  return pieces;
}

/** Which floor a playback position belongs to. */
export function floorAtProgress(pieces: RoutePiece[], progress: number) {
  if (!pieces.length) return null;
  const index = Math.min(pieces.length - 1, Math.max(0, Math.floor(progress)));
  const piece = pieces[index];
  return piece.kind === 'floor'
    ? piece.floorId
    : progress - index > 0.5
      ? piece.toFloorId
      : piece.fromFloorId;
}

/* ------------------------------------------------------------------ */
/* Focus helpers                                                       */
/* ------------------------------------------------------------------ */

export const focusOnFloor = (floor: Floor): MapFocus => ({
  key: `floor-${floor.id}`,
  floorId: floor.id,
  points: floor.outline.map(([x, y]) => ({ x, y })),
  padding: 0.02,
});
export const focusOnFeature = (feature: Feature, key = feature.id): MapFocus => ({
  key: `feature-${key}`,
  floorId: feature.floorId,
  points: feature.points.map(([x, y]) => ({ x, y })),
  padding: 0.6,
  minSize: 520,
});
export const focusOnPoints = (
  key: string,
  floorId: string,
  points: Pt[],
  padding = 0.25,
  minSize = 360,
): MapFocus => ({ key, floorId, points, padding, minSize });

export function boundsOf(points: Pt[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
export function mix(a: string, b: string, t: number) {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}
export const shade = (hex: string, amount: number) =>
  amount < 0 ? mix(hex, '#1e2a44', -amount) : mix(hex, '#ffffff', amount);

/** A more saturated version of a pastel unit colour for selected / destination states. */
export function selectedFill(base: string) {
  const [r, g, b] = toRgb(base);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const boost = (v: number) =>
    max === min ? v - 40 : min + ((v - min) / (max - min)) * (max - min + 70) - 55;
  return toHex([boost(r), boost(g), boost(b)]);
}
export const dimFill = (base: string) => mix(base, '#eef0f4', 0.72);

export const mapColors = {
  ground: '#f5f2ec',
  groundEdge: '#ded7c9',
  corridor: '#fbfaf7',
  outline: '#d9d2c3',
  route: '#1a5cff',
  routeGlow: '#8fb0ff',
  here: '#1a5cff',
  destination: '#ff5a4e',
  void: '#dfe9f2',
  water: '#9ad7ec',
  planter: '#56b879',
  glass: '#cfe6fb',
};
