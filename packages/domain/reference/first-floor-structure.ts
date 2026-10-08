import { schemas, dailyHours, type Snapshot } from '../index';
import model from './first-floor-model.json';
import { firstFloor } from './first-floor-layout';
import { firstRouteGraph, firstRouteNodeIds } from './first-floor-route-graph';
import { directoryFeatureId, hasDirectoryLayout } from './architectural-directory';

/** Publish only brands and amenities identified in the supplied First Floor drawing. */
export function withFirstFloorStructure(source: Snapshot): Snapshot {
  if (hasDirectoryLayout(source, 'l1')) return source;
  const data = structuredClone(source);
  const oldNodes = new Set(
    data.nodes.filter((node) => node.floorId === 'l1').map((node) => node.id),
  );
  data.floors = [...data.floors.filter((floor) => floor.id !== 'l1'), { ...firstFloor }];
  data.nodes = data.nodes.filter((node) => node.floorId !== 'l1');
  data.tenants = data.tenants.filter((tenant) => tenant.floorId !== 'l1');
  data.pois = data.pois.filter((poi) => poi.floorId !== 'l1');
  data.features = data.features.filter((feature) => feature.floorId !== 'l1');
  data.edges = data.edges.filter(
    (edge) => !oldNodes.has(edge.fromNode) && !oldNodes.has(edge.toNode),
  );
  data.connectors = data.connectors.filter((connector) =>
    connector.nodeIds.every((id) => !oldNodes.has(id)),
  );
  // Storefront nodes come from the traced walking graph, so places and routes agree.
  const walks = firstRouteGraph(source.edges);
  data.nodes.push(...walks.nodes);
  data.edges.push(...walks.edges);
  for (const binding of model.tenants) {
    const module = model.modules.find((module) => module.id === binding.moduleIds[0])!;
    const id = `first-tenant-${binding.id}`;
    const existing = source.tenants.find((tenant) => tenant.id === id);
    if (!firstRouteNodeIds.has(id))
      data.nodes.push(
        schemas.nodes.parse({
          id,
          floorId: 'l1',
          ...module.anchor,
          type: 'tenant',
          label: binding.name,
        }),
      );
    data.tenants.push(
      schemas.tenants.parse({
        ...existing,
        id,
        name: existing?.name ?? binding.name,
        tradingName: existing?.tradingName ?? binding.name,
        floorId: 'l1',
        categoryId: existing?.categoryId ?? binding.category,
        nodeId: id,
        featureId: directoryFeatureId('l1', module.id),
        unitNumber: binding.moduleIds
          .map((id) => id.replace('module-', '').toUpperCase())
          .join(' / '),
        subcategory:
          existing?.subcategory ??
          data.categories.find((category) => category.id === binding.category)?.name ??
          binding.category,
        description: existing?.description ?? `${binding.name} · First Floor`,
        shortSummary: existing?.shortSummary ?? '',
        productTypes: existing?.productTypes ?? [],
        services: existing?.services ?? [],
        heroImage: existing?.heroImage ?? '',
        gallery: existing?.gallery ?? [],
        phone: existing?.phone ?? '',
        website: existing?.website ?? '',
        accessibilityNotes: existing?.accessibilityNotes ?? '',
        keywords: [binding.name.toLowerCase(), ...binding.moduleIds],
        logo: existing?.logo ?? binding.logo ?? '',
        hours: existing?.hours ?? dailyHours('10:00', '22:00'),
        status: existing?.status ?? 'ACTIVE',
      }),
    );
  }
  const kinds: Record<string, string> = {
    lift: 'Lift',
    stairs: 'Stairs',
    escalator: 'Escalator',
    washroom: 'Washroom',
  };
  for (const amenity of model.amenities) {
    data.nodes.push(
      schemas.nodes.parse({
        id: amenity.id,
        floorId: 'l1',
        x: amenity.point[0],
        y: amenity.point[1],
        type: amenity.kind === 'washroom' ? 'poi' : amenity.kind,
        label: amenity.name,
      }),
    );
    data.pois.push(
      schemas.pois.parse({
        id: amenity.id,
        floorId: 'l1',
        nodeId: amenity.id,
        name: amenity.name,
        type: kinds[amenity.kind],
        accessible: false,
        description: `${amenity.name} · First Floor`,
        status: 'ACTIVE',
      }),
    );
  }
  return data;
}
