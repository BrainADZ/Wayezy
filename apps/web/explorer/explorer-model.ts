import type { Poi, Snapshot, Tenant } from '../../../packages/domain';

export interface MapPlace {
  id: string;
  name: string;
  floorId: string;
  nodeId: string;
  category: string;
  categoryId: string;
  description: string;
  kind: 'tenant' | 'poi';
  tenant?: Tenant;
  poi?: Poi;
}

export function mapPlaces(data: Snapshot): MapPlace[] {
  return [
    ...data.tenants
      .filter((item) => item.status !== 'HIDDEN')
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        floorId: tenant.floorId,
        nodeId: tenant.nodeId,
        category:
          data.categories.find((category) => category.id === tenant.categoryId)?.name ?? 'Stores',
        categoryId: tenant.categoryId,
        description: tenant.description,
        kind: 'tenant' as const,
        tenant,
      })),
    ...data.pois
      .filter((item) => item.status === 'ACTIVE')
      .map((poi) => ({
        id: poi.id,
        name: poi.name,
        floorId: poi.floorId,
        nodeId: poi.nodeId,
        category: poi.type,
        categoryId: 'amenities',
        description: poi.description,
        kind: 'poi' as const,
        poi,
      })),
  ];
}

export function placeColor(place: MapPlace) {
  if (place.tenant) return place.tenant.brandColor;
  if (place.category.toLowerCase().includes('atm')) return '#37a94b';
  if (place.kind === 'poi') return '#18a4cc';
  return (
    ({ fashion: '#b45b8b', dining: '#ed781f', services: '#4a7095' } as Record<string, string>)[
      place.categoryId
    ] ?? '#005247'
  );
}
