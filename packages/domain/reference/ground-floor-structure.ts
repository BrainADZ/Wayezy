import { schemas, dailyHours, type Snapshot } from '../index';
import model from './ground-floor-model.json';
import directory from './ground-floor-tenants.json';
import { groundRouteGraph, groundRouteNodeIds } from './ground-floor-route-graph';

/** Directory adapter uses module IDs and source-derived anchors, never generated shop geometry. */
export function withGroundFloorStructure(source: Snapshot): Snapshot {
  if (!source.floors.some((f) => f.id === 'l0')) return source;
  const data = structuredClone(source);
  const oldNodes = new Set(data.nodes.filter((n) => n.floorId === 'l0').map((n) => n.id));
  data.nodes = data.nodes.filter((n) => n.floorId !== 'l0');
  data.edges = data.edges.filter((e) => !oldNodes.has(e.fromNode) && !oldNodes.has(e.toNode));
  data.features = data.features.filter((f) => f.floorId !== 'l0');
  data.tenants = data.tenants.filter((t) => t.floorId !== 'l0');
  data.pois = data.pois.filter((p) => p.floorId !== 'l0');
  data.connectors = data.connectors
    .map((c) => ({ ...c, nodeIds: c.nodeIds.filter((id) => !oldNodes.has(id)) }))
    .filter((c) => c.nodeIds.length > 1);
  const walks = groundRouteGraph(source.edges, source.nodes);
  data.nodes.push(...walks.nodes);
  data.edges.push(...walks.edges);
  Object.assign(
    data.floors.find((f) => f.id === 'l0')!,
    {
      width: 914.89046,
      height: 1455.8265,
      name: 'Ground Floor',
      shortName: 'G',
      outline: [
        [0, 0],
        [914.89046, 0],
        [914.89046, 1455.8265],
        [0, 1455.8265],
      ],
    },
  );
  for (const binding of directory.tenants) {
    const module = model.modules.find((m) => m.id === binding.moduleIds[0]);
    if (!module) continue;
    const id = `ground-tenant-${binding.id}`;
    const legacy = source.tenants.find(
      (tenant) => tenant.id !== id && tenant.name.toLowerCase() === binding.name.toLowerCase(),
    );
    const original = source.tenants.find((tenant) => tenant.id === id) ?? legacy;
    if (!groundRouteNodeIds.has(id))
      data.nodes.push(
        schemas.nodes.parse({
          id,
          floorId: 'l0',
          ...module.anchor,
          type: 'tenant',
          label: binding.name,
        }),
      );
    data.tenants.push(
      schemas.tenants.parse({
        ...original,
        id,
        name: binding.name,
        tradingName: binding.name,
        floorId: 'l0',
        categoryId: binding.category,
        nodeId: id,
        featureId: module.id,
        unitNumber: binding.moduleIds
          .map((id) => id.replace('module-', '').toUpperCase())
          .join(' / '),
        subcategory:
          original?.subcategory ??
          data.categories.find((c) => c.id === binding.category)?.name ??
          binding.category,
        description: original?.description ?? `${binding.name} · Ground Floor`,
        shortSummary: original?.shortSummary ?? '',
        productTypes: original?.productTypes ?? [],
        services: original?.services ?? [],
        heroImage: original?.heroImage ?? '',
        gallery: original?.gallery ?? [],
        phone: original?.phone ?? '',
        website: original?.website ?? '',
        accessibilityNotes: original?.accessibilityNotes ?? '',
        keywords: [
          ...new Set([
            binding.name.toLowerCase(),
            ...binding.moduleIds,
            ...(original?.keywords ?? []),
          ]),
        ].slice(0, 40),
        logo: binding.logo || original?.logo || '',
        hours: original?.hours ?? dailyHours('10:00', '22:00'),
        status: 'ACTIVE',
      }),
    );
    if (legacy) {
      for (const offer of source.offers.filter((item) => item.tenantId === legacy.id)) {
        data.offers.push({
          ...offer,
          id: `ground-${binding.id}-${offer.id}`,
          tenantId: id,
        });
      }
    }
  }
  const poiTypes: Record<string, string> = {
    entrance: 'Entrance',
    lift: 'Lift',
    stairs: 'Stairs',
    escalator: 'Escalator',
    washroom: 'Washroom',
  };
  for (const amenity of model.amenities) {
    const [x, y] = amenity.point;
    data.nodes.push(
      schemas.nodes.parse({
        id: amenity.id,
        floorId: 'l0',
        x,
        y,
        type: amenity.kind === 'washroom' ? 'poi' : amenity.kind,
        label: amenity.name,
      }),
    );
    data.pois.push(
      schemas.pois.parse({
        id: amenity.id,
        floorId: 'l0',
        nodeId: amenity.id,
        name: amenity.name,
        type: poiTypes[amenity.kind],
        accessible: false,
        description: amenity.name,
        status: 'ACTIVE',
      }),
    );
  }
  // Legacy routes belong to a different drawing coordinate system. No guessed walking network
  // is promoted to the corrected master; surveyed door/corridor connections can be added later.
  return data;
}
