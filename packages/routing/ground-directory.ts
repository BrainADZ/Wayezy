import { findRoute } from './index';
import type { Route, RouteEdge, RouteNode } from '../domain';
import { groundRouteGraph } from '../domain/reference/ground-floor-route-graph';
import { directoryFloors, directoryRouteGraph } from '../domain/reference/directory-route-graph';

/** Topological walking guidance. Do not publish invented metres or accessibility claims. */
function topological(route: Route | null): Route | null {
  if (!route) return null;
  return {
    ...route,
    distance: 0,
    seconds: 0,
    minutes: 0,
    steps: route.steps.map((step, index) => {
      const text = step.text
        .replace(/\b(walk)\s+\d+(?:\.\d+)?\s*m\b/gi, '$1')
        .replace(/\bfor\s+\d+(?:\.\d+)?\s*m\b/gi, '')
        .replace(/\s+and walk(?=\.)/gi, '')
        .replace(/\s+\./g, '.')
        .replace(/\s{2,}/g, ' ');
      const ride = route.steps[index - 1];
      return {
        ...step,
        distance: 0,
        text:
          ride?.connector && text === 'Walk.'
            ? `Leave the ${ride.kind === 'lift' ? 'lift' : 'escalator'} and follow the walkway.`
            : text,
      };
    }),
  };
}

export function findGroundDirectoryRoute(
  origin: string,
  destination: string,
  accessible: boolean,
  savedEdges: RouteEdge[] = [],
  savedNodes: RouteNode[] = [],
): Route | null {
  if (accessible) return null;
  const { nodes, edges } = groundRouteGraph(savedEdges, savedNodes);
  return topological(findRoute(nodes, edges, origin, destination));
}

/** Ground and First Floor walking guidance, changing floors by the stacked lifts and escalators. */
export function findDirectoryRoute(
  origin: string,
  destination: string,
  accessible: boolean,
  savedEdges: RouteEdge[] = [],
  savedNodes: RouteNode[] = [],
): Route | null {
  if (accessible) return null;
  const { nodes, edges } = directoryRouteGraph(savedEdges, savedNodes);
  return topological(findRoute(nodes, edges, origin, destination, false, directoryFloors));
}
