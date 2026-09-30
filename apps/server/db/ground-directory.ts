import { schemas, type Snapshot } from '../../../packages/domain';
import model from '../../../packages/domain/reference/ground-floor-model.json';
import directory from '../../../packages/domain/reference/ground-floor-tenants.json';
import { withGroundFloorStructure } from '../../../packages/domain/reference/ground-floor-structure';
import type { AppContext } from '../context';
import { ContentRepository } from '../repositories/content';

/** Make the shops shown on the Ground Floor map editable in COMMAND. Keep legacy rows intact. */
export async function installGroundDirectory(context: AppContext) {
  const working = await context.content.workingCopy();
  if (!working.floors.some((floor) => floor.id === 'l0')) return;

  const mapTenants = withGroundFloorStructure({
    ...working,
    version: '',
    publishedAt: '',
  } as Snapshot).tenants;
  const tenantById = new Map(mapTenants.map((tenant) => [tenant.id, tenant]));
  const knownNodes = new Set(working.nodes.map((node) => node.id));
  const knownFeatures = new Set(working.features.map((feature) => feature.id));
  const knownTenants = new Map(working.tenants.map((tenant) => [tenant.id, tenant]));
  let added = 0;

  await context.db.transaction(async (tx) => {
    const content = new ContentRepository(tx, context.config.venueId);
    for (const binding of directory.tenants) {
      const id = `ground-tenant-${binding.id}`;
      const tenant = tenantById.get(id);
      const module = model.modules.find((item) => item.id === binding.moduleIds[0]);
      if (!tenant || !module) continue;

      if (!knownNodes.has(id)) {
        await content.insertRaw(
          'nodes',
          schemas.nodes.parse({
            id,
            floorId: 'l0',
            ...module.anchor,
            type: 'tenant',
            label: binding.name,
          }),
        );
        knownNodes.add(id);
      }
      if (!knownFeatures.has(module.id)) {
        const { x, y, width, height } = module.bounds;
        await content.insertRaw(
          'features',
          schemas.features.parse({
            id: module.id,
            floorId: 'l0',
            label: binding.name,
            kind: 'unit',
            points: [
              [x, y],
              [x + width, y],
              [x + width, y + height],
              [x, y + height],
            ],
            color: '#e6e0d5',
          }),
        );
        knownFeatures.add(module.id);
      }

      const existing = knownTenants.get(id);
      if (!existing) {
        await content.insertRaw('tenants', tenant);
        added++;
        continue;
      }
      const fields = [
        'name',
        'tradingName',
        'floorId',
        'categoryId',
        'nodeId',
        'featureId',
        'unitNumber',
        'logo',
        'status',
      ] as const;
      if (fields.some((field) => existing[field] !== tenant[field]))
        await content.update(
          'tenants',
          id,
          Object.fromEntries(fields.map((field) => [field, tenant[field]])),
        );
    }
  });

  if (added) context.logger.info('Ground Floor map brands added to COMMAND', { added });
}
