import type { RouteEdge, RouteNode } from '../index';
import circulation from './first-floor-circulation.json';
import model from './first-floor-model.json';
import { buildWalkGraph } from './walk-graph';

const names = new Map(model.tenants.map((tenant) => [`first-tenant-${tenant.id}`, tenant.name]));
const graph = buildWalkGraph(circulation.aisles, circulation.frontages, {
  destination: (id) => `first-tenant-${id}`,
  walk: 'first-walk-',
});

/** Walking graph traced from the First Floor drawing's tiled corridors, in its own coordinates. */
export const firstRouteNodes: RouteNode[] = graph.nodes.map((node) => ({
  ...node,
  floorId: 'l1',
  type: names.has(node.id) ? 'tenant' : 'corridor',
  label: names.get(node.id) ?? 'Walkway',
  connectorId: '',
  landmark: false,
}));

const byId = new Map(firstRouteNodes.map((node) => [node.id, node]));
export const firstRouteEdges: RouteEdge[] = graph.edges.map((edge, index) => {
  const from = byId.get(edge.from)!;
  const to = byId.get(edge.to)!;
  const length = Math.hypot(from.x - to.x, from.y - to.y);
  return {
    id: `first-walk-edge-${index}`,
    fromNode: edge.from,
    toNode: edge.to,
    distance: length,
    estimatedTime: length,
    type: 'corridor',
    weight: 1,
    direction: 'BOTH',
    active: true,
    accessible: false,
    restricted: false,
    reason: '',
  };
});

export const firstRouteNodeIds = new Set(firstRouteNodes.map((node) => node.id));

/** Apply published corridor closures without changing the traced line geometry. */
export function firstRouteGraph(savedEdges: RouteEdge[] = [], savedNodes: RouteNode[] = []) {
  const saved = new Map(savedEdges.map((edge) => [edge.id, edge]));
  const customNodes = savedNodes.filter(
    (node) => node.floorId === 'l1' && node.id.startsWith('first-custom-node-'),
  );
  const ids = new Set([...firstRouteNodeIds, ...customNodes.map((node) => node.id)]);
  const customEdges = savedEdges.filter(
    (edge) =>
      edge.id.startsWith('first-custom-edge-') && ids.has(edge.fromNode) && ids.has(edge.toNode),
  );
  return {
    nodes: [...firstRouteNodes, ...customNodes],
    edges: [
      ...firstRouteEdges.map((edge) => {
        const current = saved.get(edge.id);
        return current
          ? {
              ...edge,
              active: current.active,
              reason: current.reason,
              restricted: current.restricted,
            }
          : edge;
      }),
      ...customEdges,
    ],
  };
}
