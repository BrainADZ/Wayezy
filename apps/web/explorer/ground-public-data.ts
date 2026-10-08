import type { Snapshot } from '../../../packages/domain';
import { withGroundFloorStructure } from '../../../packages/domain/reference/ground-floor-structure';
import { withFirstFloorStructure } from '../../../packages/domain/reference/first-floor-structure';
import { directoryFloors } from '../../../packages/domain/reference/directory-route-graph';
import {
  hasDirectoryLayout,
  isDirectoryTenant,
  isDirectoryPoi,
  directoryOffers,
} from '../../../packages/domain/reference/architectural-directory';

/** Architectural floors and published ground-floor places shared by kiosk and GO. */
export function groundPublicData(source: Snapshot): Snapshot {
  const directory = withFirstFloorStructure(withGroundFloorStructure(source));
  const publishedFloor = (floorId: string) => floorId === 'l0' || floorId === 'l1';
  const nodes = directory.nodes.filter((node) => publishedFloor(node.floorId));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const tenants = directory.tenants.filter(
    (tenant) =>
      publishedFloor(tenant.floorId) &&
      (!hasDirectoryLayout(directory, tenant.floorId) || isDirectoryTenant(tenant)),
  );

  return {
    ...directory,
    floors: directoryFloors.map((floor) => ({
      ...directory.floors.find((item) => item.id === floor.id),
      ...floor,
    })),
    features: directory.features.filter((feature) => publishedFloor(feature.floorId)),
    nodes,
    edges: directory.edges.filter((edge) => nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode)),
    connectors: [],
    tenants,
    pois: directory.pois.filter(isDirectoryPoi),
    offers: directoryOffers(directory, tenants),
  };
}
