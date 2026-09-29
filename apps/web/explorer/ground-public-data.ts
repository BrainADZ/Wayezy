import type { Snapshot } from '../../../packages/domain';
import { withGroundFloorStructure } from '../../../packages/domain/reference/ground-floor-structure';

/** The same published ground-floor places used by the kiosk map and WAY EZY GO. */
export function groundPublicData(source: Snapshot): Snapshot {
  const directory = withGroundFloorStructure(source);
  const nodes = directory.nodes.filter((node) => node.floorId === 'l0');
  const nodeIds = new Set(nodes.map((node) => node.id));
  const tenants = directory.tenants.filter((tenant) => tenant.floorId === 'l0');
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));

  return {
    ...directory,
    floors: directory.floors.filter((floor) => floor.id === 'l0'),
    features: directory.features.filter((feature) => feature.floorId === 'l0'),
    nodes,
    edges: directory.edges.filter(
      (edge) => nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode),
    ),
    connectors: [],
    tenants,
    pois: directory.pois.filter((poi) => poi.floorId === 'l0'),
    offers: directory.offers.filter((offer) => tenantIds.has(offer.tenantId)),
  };
}
