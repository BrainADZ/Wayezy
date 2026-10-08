import { schemas, type Snapshot } from '../../../packages/domain';
import {
  directoryLayoutId,
  directoryModels,
  directoryUnits,
  hasDirectoryLayout,
} from '../../../packages/domain/reference/architectural-directory';
import { withGroundFloorStructure } from '../../../packages/domain/reference/ground-floor-structure';
import { withFirstFloorStructure } from '../../../packages/domain/reference/first-floor-structure';
import { directoryRouteGraph } from '../../../packages/domain/reference/directory-route-graph';
import type { AppContext } from '../context';
import { ContentRepository } from '../repositories/content';

/** Add missing map records to the draft once. Existing edits and published snapshots stay intact. */
export async function installArchitecturalDirectory(context: AppContext) {
  const working = await context.content.workingCopy();
  if (!working.floors.some((floor) => floor.id === 'l0')) return;
  const missing = ['l0', 'l1'].filter((id) => !hasDirectoryLayout(working, id));
  if (!missing.length) return;
  const mapped = withFirstFloorStructure(
    withGroundFloorStructure({ ...working, version: '', publishedAt: '' } as Snapshot),
  );
  const graph = directoryRouteGraph(working.edges, working.nodes);
  const merge = <T extends { id: string }>(old: T[], added: T[]) => [
    ...new Map([...old, ...added].map((item) => [item.id, item])).values(),
  ];
  mapped.nodes = merge(mapped.nodes, graph.nodes);
  mapped.edges = merge(mapped.edges, graph.edges);
  const features = directoryUnits
    .filter((unit) => missing.includes(unit.floorId))
    .map((unit) => {
      const { x, y, width, height } = unit.module.bounds;
      return schemas.features.parse({
        id: unit.featureId,
        floorId: unit.floorId,
        label: unit.label,
        kind: 'unit',
        color: '#e6e0d5',
        points: [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ],
      });
    });
  const markers = missing.map((floorId) => {
    const { x, y, width, height } = directoryModels[floorId as keyof typeof directoryModels].bounds;
    return schemas.features.parse({
      id: directoryLayoutId(floorId),
      floorId,
      label: 'Architectural directory',
      kind: 'decor',
      color: '#e6e0d5',
      points: [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ],
    });
  });
  let added = 0;
  await context.db.transaction(async (tx) => {
    const content = new ContentRepository(tx, context.config.venueId);
    for (const resource of ['floors', 'features', 'nodes', 'edges', 'tenants', 'pois'] as const) {
      const existing = new Set(working[resource].map((item) => item.id));
      const items = resource === 'features' ? features : mapped[resource];
      for (const item of items) {
        if (existing.has(item.id)) continue;
        await content.insertRaw(resource, item);
        existing.add(item.id);
        added++;
      }
    }
    for (const marker of markers) await content.insertRaw('features', marker);
  });
  if (added) {
    await context.audit.record({
      action: 'create',
      entityType: 'directory',
      entityId: 'architectural-floors',
      summary: `Added ${added} missing map records to the draft; publish to make changes live`,
    });
    context.logger.info('Architectural floor drafts added to COMMAND', { floors: missing, added });
  }
}
