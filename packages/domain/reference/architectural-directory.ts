import type { Snapshot, Tenant, Poi, Offer } from '../index';
import ground from './ground-floor-model.json';
import first from './first-floor-model.json';
import groundBindings from './ground-floor-tenants.json';

export const directoryModels = { l0: ground, l1: first };
export type DirectoryFloorId = keyof typeof directoryModels;
export const directoryLayoutId = (floorId: string) => `directory-layout-${floorId}`;
export const directoryFeatureId = (floorId: string, moduleId: string) =>
  floorId === 'l1' ? `first-${moduleId}` : moduleId;

/** Stable unit references; the architectural SVG remains the rendering geometry. */
export const directoryUnits = Object.entries(directoryModels).flatMap(([floorId, model]) =>
  model.displayModules.map((module) => {
    const parts = model.modules.filter((part) =>
      part.sourceIds.every((id) => module.sourceIds.includes(id)),
    );
    const binding = (floorId === 'l0' ? groundBindings.tenants : first.tenants).find(
      (tenant) =>
        `${floorId === 'l0' ? 'ground' : 'first'}-tenant-${tenant.id}` === module.tenantId,
    );
    const unitNumber = parts
      .map((part) => part.id.replace('module-', '').toUpperCase())
      .join(' / ');
    return {
      floorId,
      featureId: directoryFeatureId(floorId, module.id),
      module,
      unitNumber,
      label: `Unit ${unitNumber}`,
      defaultTenantId: module.tenantId,
      defaultFeatureId: binding ? directoryFeatureId(floorId, binding.moduleIds[0]) : '',
      defaultName: binding?.name,
      defaultLabel:
        binding && 'shortName' in binding && typeof binding.shortName === 'string'
          ? binding.shortName
          : binding?.name,
    };
  }),
);
export type DirectoryUnit = (typeof directoryUnits)[number];

export function hasDirectoryLayout(source: Pick<Snapshot, 'features'>, floorId: string) {
  return source.features.some((feature) => feature.id === directoryLayoutId(floorId));
}

export function isDirectoryTenant(tenant: Pick<Tenant, 'featureId' | 'floorId'>) {
  return directoryUnits.some(
    (unit) => unit.floorId === tenant.floorId && unit.featureId === tenant.featureId,
  );
}

export function isDirectoryPoi(poi: Pick<Poi, 'id' | 'floorId' | 'nodeId'>) {
  const model = directoryModels[poi.floorId as DirectoryFloorId];
  return (
    !!model &&
    (model.amenities.some((amenity) => amenity.id === poi.id) ||
      poi.nodeId.startsWith(`${poi.floorId === 'l0' ? 'ground' : 'first'}-custom-node-`))
  );
}

/** Keep existing offers linked to their surveyed brand without rewriting their saved IDs. */
export function directoryOffers(
  source: Pick<Snapshot, 'offers' | 'tenants'>,
  tenants: Tenant[],
): Offer[] {
  const ids = new Set(tenants.map((tenant) => tenant.id));
  return source.offers.flatMap((offer) => {
    if (ids.has(offer.tenantId)) return [offer];
    const legacy = source.tenants.find((tenant) => tenant.id === offer.tenantId);
    if (!legacy) return [];
    const unit = directoryUnits.find(
      (unit) =>
        unit.floorId === legacy.floorId &&
        unit.defaultName?.toLowerCase() === legacy.name.toLowerCase() &&
        ids.has(unit.defaultTenantId ?? ''),
    );
    if (!unit?.defaultTenantId) return [];
    const brand = unit.defaultTenantId.replace(/^(ground|first)-tenant-/, '');
    if (
      source.offers.some(
        (other) =>
          other.id === `ground-${brand}-${offer.id}` && other.tenantId === unit.defaultTenantId,
      )
    )
      return [];
    return [{ ...offer, tenantId: unit.defaultTenantId }];
  });
}

/** One saved brand may own multiple separate storefronts (for example Good Earth). */
export function tenantForDirectoryUnit<T extends Pick<Tenant, 'id' | 'floorId' | 'featureId'>>(
  unit: DirectoryUnit,
  tenants: T[],
): T | undefined {
  return (
    tenants.find(
      (tenant) => tenant.floorId === unit.floorId && tenant.featureId === unit.featureId,
    ) ??
    tenants.find(
      (tenant) =>
        tenant.id === unit.defaultTenantId &&
        tenant.floorId === unit.floorId &&
        tenant.featureId === unit.defaultFeatureId,
    )
  );
}
