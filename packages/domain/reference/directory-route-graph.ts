import type { Floor, RouteEdge, RouteNode } from '../index';
import groundModel from './ground-floor-model.json';
import firstModel from './first-floor-model.json';
import { firstFloor } from './first-floor-layout';
import { groundRouteGraph } from './ground-floor-route-graph';
import { firstRouteGraph } from './first-floor-route-graph';

type P = [number, number];

/** Floors in the published directory, labelled plainly for spoken/written directions. */
export const directoryFloors: Floor[] = [
  {
    id: 'l0',
    name: 'Ground Floor',
    shortName: 'G',
    theme: '',
    level: 0,
    width: 914.89046,
    height: 1455.8265,
    metresPerUnit: 1,
    outline: [
      [0, 0],
      [914.89046, 0],
      [914.89046, 1455.8265],
      [0, 1455.8265],
    ],
    sortOrder: 0,
  },
  { ...firstFloor, theme: '' },
];
export const directoryFloorIds = new Set(directoryFloors.map((floor) => floor.id));

/**
 * Lift and escalator banks that stack between the two drawings (the cores line up at a
 * ~1.04 scale between the source files). `access` runs from a point on that floor's walkway,
 * through the lobby or landing, to the amenity point. Core stairs and the goods/service
 * lifts are fire and back-of-house routes, so they are not offered to visitors.
 */
export const floorConnectors: {
  id: string;
  type: 'lift' | 'escalator';
  label: string;
  ground: { amenityId: string; access: P[] };
  first: { amenityId: string; access: P[] };
}[] = [
  {
    id: 'lift-c',
    type: 'lift',
    label: 'Lift C',
    ground: {
      amenityId: 'lift-c',
      access: [
        [164, 888],
        [234.93, 888],
      ],
    },
    first: { amenityId: 'first-lift-c', access: [[324, 995]] },
  },
  {
    id: 'lift-d',
    type: 'lift',
    label: 'Lift D',
    ground: {
      amenityId: 'lift-d',
      access: [
        [620, 888],
        [548.26, 888],
      ],
    },
    first: { amenityId: 'first-lift-d', access: [[731, 995]] },
  },
  {
    id: 'lift-e',
    type: 'lift',
    label: 'Lift E',
    ground: {
      amenityId: 'lift-e',
      access: [
        [164, 1060],
        [237.59, 1060],
      ],
    },
    first: { amenityId: 'first-lift-e', access: [[324, 1216]] },
  },
  {
    id: 'escalator-c',
    type: 'escalator',
    label: 'Escalator C',
    ground: { amenityId: 'escalator-west', access: [[269.3, 974]] },
    first: { amenityId: 'first-escalator-c', access: [[324, 1048]] },
  },
  {
    id: 'escalator-e',
    type: 'escalator',
    label: 'Escalator E',
    ground: { amenityId: 'escalator-west-south', access: [[269.3, 974]] },
    first: { amenityId: 'first-escalator-e', access: [[324, 1163]] },
  },
  {
    id: 'escalator-d',
    type: 'escalator',
    label: 'Escalator D',
    ground: { amenityId: 'escalator-east', access: [[518.1, 974]] },
    first: { amenityId: 'first-escalator-d', access: [[731, 1048]] },
  },
  {
    id: 'escalator-cinema',
    type: 'escalator',
    label: 'Cinema escalator',
    ground: { amenityId: 'escalator-east-south', access: [[519.7, 974]] },
    first: { amenityId: 'first-escalator-cinema', access: [[731, 1163]] },
  },
];

// Relative to walking cost (one unit per drawing unit): escalators are a short ride,
// lifts include their typical wait, so the fastest route prefers the escalators.
const RIDE_COST = { escalator: 60, lift: 360 };

const amenityPoint = (floorId: string, id: string): P => {
  const amenities = floorId === 'l0' ? groundModel.amenities : firstModel.amenities;
  const amenity = amenities.find((item) => item.id === id);
  if (!amenity) throw new Error(`Missing ${floorId} connector amenity ${id}.`);
  return amenity.point as P;
};

function walkEdge(id: string, from: RouteNode, to: RouteNode, template?: RouteEdge): RouteEdge {
  const length = Math.max(0.01, Math.hypot(from.x - to.x, from.y - to.y));
  return {
    type: 'corridor',
    weight: 1,
    direction: 'BOTH',
    active: true,
    accessible: false,
    restricted: false,
    reason: '',
    ...template,
    id,
    fromNode: from.id,
    toNode: to.id,
    distance: length,
    estimatedTime: length,
  };
}

/** Find or create the walkway node at `point`, splitting the corridor edge it lies on. */
function attach(
  nodes: RouteNode[],
  edges: RouteEdge[],
  floorId: string,
  point: P,
  id: string,
): RouteNode {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const existing = nodes.find(
    (node) =>
      node.floorId === floorId &&
      node.type === 'corridor' &&
      Math.hypot(node.x - point[0], node.y - point[1]) < 0.01,
  );
  if (existing) return existing;
  const index = edges.findIndex((edge) => {
    const a = byId.get(edge.fromNode),
      b = byId.get(edge.toNode);
    if (!a || !b || a.floorId !== floorId || b.floorId !== floorId || edge.type !== 'corridor')
      return false;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const cross = (b.x - a.x) * (point[1] - a.y) - (b.y - a.y) * (point[0] - a.x);
    const dot = (point[0] - a.x) * (b.x - a.x) + (point[1] - a.y) * (b.y - a.y);
    return Math.abs(cross) / length < 0.05 && dot > 0 && dot < length * length;
  });
  if (index < 0) throw new Error(`Connector access ${id} is not on a ${floorId} walkway.`);
  const edge = edges[index];
  const node: RouteNode = {
    id,
    floorId,
    x: point[0],
    y: point[1],
    type: 'corridor',
    label: 'Walkway',
    connectorId: '',
    landmark: false,
  };
  nodes.push(node);
  edges.splice(
    index,
    1,
    walkEdge(`${edge.id}.a`, byId.get(edge.fromNode)!, node, edge),
    walkEdge(`${edge.id}.b`, node, byId.get(edge.toNode)!, edge),
  );
  return node;
}

/**
 * Both floors' walking graphs joined by the stacked lifts and escalators. Saved closures
 * apply to walkways and to each floor link (`floor-link-<connector>`).
 */
export function directoryRouteGraph(savedEdges: RouteEdge[] = [], savedNodes: RouteNode[] = []) {
  const ground = groundRouteGraph(savedEdges, savedNodes);
  const first = firstRouteGraph(savedEdges, savedNodes);
  const nodes = [...ground.nodes, ...first.nodes];
  const edges = [...ground.edges, ...first.edges];
  const saved = new Map(savedEdges.map((edge) => [edge.id, edge]));
  for (const connector of floorConnectors) {
    const ends = (
      [
        ['l0', connector.ground],
        ['l1', connector.first],
      ] as const
    ).map(([floorId, side]) => {
      const point = amenityPoint(floorId, side.amenityId);
      const node: RouteNode = {
        id: side.amenityId,
        floorId,
        x: point[0],
        y: point[1],
        type: connector.type,
        label: connector.label,
        connectorId: connector.id,
        landmark: true,
      };
      let previous = attach(nodes, edges, floorId, side.access[0], `${side.amenityId}-access`);
      nodes.push(node);
      for (const [i, via] of side.access.slice(1).entries()) {
        const step: RouteNode = {
          ...previous,
          id: `${side.amenityId}-access-${i + 1}`,
          x: via[0],
          y: via[1],
        };
        nodes.push(step);
        edges.push(walkEdge(`${step.id}-walk`, previous, step));
        previous = step;
      }
      edges.push(walkEdge(`${side.amenityId}-landing`, previous, node));
      return node;
    });
    const current = saved.get(`floor-link-${connector.id}`);
    edges.push({
      id: `floor-link-${connector.id}`,
      fromNode: ends[0].id,
      toNode: ends[1].id,
      distance: 1,
      estimatedTime: RIDE_COST[connector.type],
      type: connector.type,
      weight: 1,
      direction: 'BOTH',
      active: current?.active ?? true,
      accessible: false,
      restricted: current?.restricted ?? false,
      reason: current?.reason ?? '',
    });
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  edges.push(
    ...savedEdges.filter(
      (edge) =>
        /^(ground|first)-custom-edge-/.test(edge.id) &&
        !edgeIds.has(edge.id) &&
        nodeIds.has(edge.fromNode) &&
        nodeIds.has(edge.toNode),
    ),
  );
  return {
    nodes,
    edges: edges.map((edge) => {
      const current = saved.get(edge.id);
      return current
        ? {
            ...edge,
            active: current.active,
            restricted: current.restricted,
            reason: current.reason,
          }
        : edge;
    }),
  };
}
