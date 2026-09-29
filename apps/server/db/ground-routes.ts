import { randomBytes } from 'node:crypto';
import {
  groundRouteEdges,
  groundRouteNodes,
} from '../../../packages/domain/reference/ground-floor-route-graph';
import type { AppContext } from '../context';
import { ContentRepository } from '../repositories/content';

/** Add the architectural walking graph beside legacy demo data without deleting admin edits. */
export async function installGroundRoutes(context: AppContext) {
  if (!context.config.isDemo || (await context.content.get('edges', groundRouteEdges[0].id)))
    return;
  const published = await context.snapshots.latest();
  if (!published || !published.data.floors.some((floor) => floor.id === 'l0')) return;
  const working = await context.content.workingCopy();
  const nodeIds = new Set(working.nodes.map((node) => node.id));
  const edgeIds = new Set(working.edges.map((edge) => edge.id));
  const publicData = structuredClone(published.data);
  const publicNodeIds = new Set(publicData.nodes.map((node) => node.id));
  const publicEdgeIds = new Set(publicData.edges.map((edge) => edge.id));
  publicData.nodes.push(...groundRouteNodes.filter((node) => !publicNodeIds.has(node.id)));
  publicData.edges.push(...groundRouteEdges.filter((edge) => !publicEdgeIds.has(edge.id)));
  publicData.version = `${new Date().toISOString().slice(0, 10)}-ground-routes-${randomBytes(4).toString('hex')}`;
  publicData.publishedAt = new Date().toISOString();

  await context.db.transaction(async (tx) => {
    const content = new ContentRepository(tx, context.config.venueId);
    for (const node of groundRouteNodes)
      if (!nodeIds.has(node.id)) await content.insertRaw('nodes', node);
    for (const edge of groundRouteEdges)
      if (!edgeIds.has(edge.id)) await content.insertRaw('edges', edge);
    await tx.query(
      'insert into published_snapshots (version, venue_id, data, published_at, published_by, note) values ($1, $2, $3::jsonb, $4, $5, $6)',
      [
        publicData.version,
        context.config.venueId,
        JSON.stringify(publicData),
        publicData.publishedAt,
        'ground-route-import',
        'Added source-validated Ground Floor walks',
      ],
    );
  });
  context.snapshots.invalidate();
  context.logger.info('Ground Floor walking graph installed', {
    nodes: groundRouteNodes.length,
    edges: groundRouteEdges.length,
  });
}
