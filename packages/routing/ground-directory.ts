import { findRoute } from './index';
import type { Route, RouteEdge, RouteNode } from '../domain';
import { groundRouteGraph } from '../domain/reference/ground-floor-route-graph';

/** Topological walking guidance. Do not publish invented metres or accessibility claims. */
export function findGroundDirectoryRoute(
  origin: string,
  destination: string,
  accessible: boolean,
  savedEdges: RouteEdge[] = [],
  savedNodes: RouteNode[] = [],
): Route | null {
  if (accessible) return null;
  const { nodes, edges } = groundRouteGraph(savedEdges, savedNodes);
  const route = findRoute(nodes, edges, origin, destination);
  if (!route) return null;
  return {
    ...route,
    distance: 0,
    seconds: 0,
    minutes: 0,
    steps: route.steps.map((step) => ({
      ...step,
      distance: 0,
      text: step.text
        .replace(/\bwalk\s+\d+(?:\.\d+)?\s*m\b/gi, 'walk')
        .replace(/\bfor\s+\d+(?:\.\d+)?\s*m\b/gi, '')
        .replace(/\s+and walk(?=\.)/gi, '')
        .replace(/\s+\./g, '.')
        .replace(/\s{2,}/g, ' '),
    })),
  };
}
