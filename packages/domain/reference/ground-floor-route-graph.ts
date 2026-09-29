import type { RouteEdge, RouteNode } from '../index';
import graph from './ground-floor-walks.json';
import directory from './ground-floor-tenants.json';

const names = new Map(
  directory.tenants.map((tenant) => [`ground-tenant-${tenant.id}`, tenant.name]),
);

/** The source-validated walking graph uses the architectural SVG's coordinates. */
export const groundRouteNodes: RouteNode[] = graph.nodes.map((node) => ({
  ...node,
  floorId: 'l0',
  type: node.id === 'ground-entry-starbucks' ? 'kiosk' : names.has(node.id) ? 'tenant' : 'corridor',
  label: node.id === 'ground-entry-starbucks' ? 'You Are Here' : (names.get(node.id) ?? 'Walkway'),
  connectorId: '',
  landmark: false,
}));

const byId = new Map(groundRouteNodes.map((node) => [node.id, node]));
export const groundRouteEdges: RouteEdge[] = graph.edges.map((edge, index) => {
  const from = byId.get(edge.from)!;
  const to = byId.get(edge.to)!;
  const length = Math.hypot(from.x - to.x, from.y - to.y);
  return {
    id: `master-walk-${index}`,
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

export const groundRouteNodeIds = new Set(groundRouteNodes.map((node) => node.id));
export const groundRouteEdgeIds = new Set(groundRouteEdges.map((edge) => edge.id));

/** Apply published/admin corridor closures without changing validated line geometry. */
export function groundRouteGraph(savedEdges: RouteEdge[] = [], savedNodes: RouteNode[] = []) {
  const saved = new Map(savedEdges.map((edge) => [edge.id, edge]));
  const customNodes = savedNodes.filter(
    (node) => node.floorId === 'l0' && node.id.startsWith('ground-custom-node-'),
  );
  const ids = new Set([...groundRouteNodeIds, ...customNodes.map((node) => node.id)]);
  const customEdges = savedEdges.filter(
    (edge) =>
      edge.id.startsWith('ground-custom-edge-') && ids.has(edge.fromNode) && ids.has(edge.toNode),
  );
  return {
    nodes: [...groundRouteNodes, ...customNodes],
    edges: [
      ...groundRouteEdges.map((edge) => {
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
