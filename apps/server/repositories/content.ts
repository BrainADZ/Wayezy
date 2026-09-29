import { randomBytes } from 'node:crypto';
import { schemas, type ContentResource, type Snapshot, type Venue } from '../../../packages/domain';
import type { Queryable } from '../db/database';
import { fromRow, placeholders, tables, toRow, venueColumns, type TableDef } from '../db/tables';
import { badRequest, notFound } from '../errors';

export type TableResource = Exclude<ContentResource, 'venue'>;
export type WorkingCopy = Omit<Snapshot, 'version' | 'publishedAt'>;

export function isTableResource(value: string): value is TableResource {
  return Object.prototype.hasOwnProperty.call(tables, value);
}

export function slugId(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'item'}-${randomBytes(3).toString('hex')}`;
}

/**
 * Generic, schema-validated CRUD over the content tables. Every row is scoped to one venue.
 * Cross-record links (tenant → node on the same floor, campaign → media …) are checked here so
 * admins get a readable message instead of a database error.
 */
export class ContentRepository {
  constructor(
    private db: Queryable,
    readonly venueId: string,
  ) {}

  withTransaction(tx: Queryable) {
    return new ContentRepository(tx, this.venueId);
  }

  async list<T>(resource: TableResource): Promise<T[]> {
    const def = tables[resource];
    const rows = await this.db.query(
      `select ${def.columns.map((c) => c[1]).join(', ')} from ${def.table} where venue_id = $1 order by ${def.orderBy}`,
      [this.venueId],
    );
    return rows.map((row) => fromRow<T>(def.columns, row));
  }

  async get<T>(resource: TableResource, id: string): Promise<T | null> {
    const def = tables[resource];
    const rows = await this.db.query(
      `select ${def.columns.map((c) => c[1]).join(', ')} from ${def.table} where venue_id = $1 and id = $2`,
      [this.venueId, id],
    );
    return rows[0] ? fromRow<T>(def.columns, rows[0]) : null;
  }

  /** Insert without validation — used by the seed and by `create` after validation. */
  async insertRaw(resource: TableResource, item: Record<string, unknown>) {
    const def = tables[resource];
    const columns = ['venue_id', ...def.columns.map((c) => c[1])];
    await this.db.query(
      `insert into ${def.table} (${columns.join(', ')}) values ($1, ${placeholders(def.columns, 1).join(', ')})`,
      [this.venueId, ...toRow(def.columns, item)],
    );
  }

  parse(resource: TableResource, input: unknown) {
    return schemas[resource].parse(input) as Record<string, unknown>;
  }

  async create(resource: TableResource, input: Record<string, unknown>) {
    const withId = {
      ...input,
      id: input.id || slugId(String(input.name ?? input.title ?? input.label ?? resource)),
    };
    const item = this.parse(resource, withId);
    if (await this.get(resource, String(item.id)))
      throw badRequest(
        `A ${tables[resource].label.toLowerCase()} with ID "${item.id}" already exists.`,
      );
    await this.checkLinks(resource, item);
    await this.insertRaw(resource, item);
    return item;
  }

  async update(resource: TableResource, id: string, patch: Record<string, unknown>) {
    const def = tables[resource];
    const current = await this.get<Record<string, unknown>>(resource, id);
    if (!current) throw notFound(`${def.label} not found.`);
    const item = this.parse(resource, { ...current, ...patch, id });
    await this.checkLinks(resource, item);
    const assignments = def.columns.filter((c) => c[1] !== 'id');
    const sets = assignments.map(
      ([, column, type], i) =>
        `${column} = $${i + 3}${type === 'json' || type === 'jsonNullable' ? '::jsonb' : ''}`,
    );
    await this.db.query(
      `update ${def.table} set ${sets.join(', ')}, updated_at = now() where venue_id = $1 and id = $2`,
      [this.venueId, id, ...toRow(assignments, item)],
    );
    return { before: current, after: item };
  }

  async remove(resource: TableResource, id: string) {
    const def = tables[resource];
    const current = await this.get<Record<string, unknown>>(resource, id);
    if (!current) throw notFound(`${def.label} not found.`);
    await this.db.query(`delete from ${def.table} where venue_id = $1 and id = $2`, [
      this.venueId,
      id,
    ]);
    return current;
  }

  async getVenue(): Promise<Venue> {
    const rows = await this.db.query(
      `select ${venueColumns.map((c) => c[1]).join(', ')} from venues where id = $1`,
      [this.venueId],
    );
    if (!rows[0]) throw notFound('Venue not configured.');
    return fromRow<Venue>(venueColumns, rows[0]);
  }

  async insertVenue(venue: Venue) {
    await this.db.query(
      `insert into venues (${venueColumns.map((c) => c[1]).join(', ')}) values (${placeholders(venueColumns).join(', ')})`,
      toRow(venueColumns, venue),
    );
  }

  async updateVenue(patch: Record<string, unknown>) {
    const current = await this.getVenue();
    const venue = schemas.venue.parse({ ...current, ...patch, id: this.venueId });
    const assignments = venueColumns.filter((c) => c[1] !== 'id');
    const sets = assignments.map(
      ([, column, type], i) => `${column} = $${i + 2}${type === 'json' ? '::jsonb' : ''}`,
    );
    await this.db.query(`update venues set ${sets.join(', ')}, updated_at = now() where id = $1`, [
      this.venueId,
      ...toRow(assignments, venue),
    ]);
    return { before: current, after: venue };
  }

  async workingCopy(): Promise<WorkingCopy> {
    const [
      venue,
      floors,
      categories,
      features,
      nodes,
      edges,
      connectors,
      tenants,
      pois,
      offers,
      events,
      campaigns,
      devices,
      media,
    ] = await Promise.all([
      this.getVenue(),
      this.list<Snapshot['floors'][number]>('floors'),
      this.list<Snapshot['categories'][number]>('categories'),
      this.list<Snapshot['features'][number]>('features'),
      this.list<Snapshot['nodes'][number]>('nodes'),
      this.list<Snapshot['edges'][number]>('edges'),
      this.list<Snapshot['connectors'][number]>('connectors'),
      this.list<Snapshot['tenants'][number]>('tenants'),
      this.list<Snapshot['pois'][number]>('pois'),
      this.list<Snapshot['offers'][number]>('offers'),
      this.list<Snapshot['events'][number]>('events'),
      this.list<Snapshot['campaigns'][number]>('campaigns'),
      this.list<Snapshot['devices'][number]>('devices'),
      this.list<Snapshot['media'][number]>('media'),
    ]);
    return {
      venue,
      floors,
      categories,
      features,
      nodes,
      edges,
      connectors,
      tenants,
      pois,
      offers,
      events,
      campaigns,
      devices,
      media,
    };
  }

  private async exists(resource: TableResource, id: string) {
    if (!id) return false;
    const rows = await this.db.query(
      `select 1 from ${tables[resource].table} where venue_id = $1 and id = $2`,
      [this.venueId, id],
    );
    return rows.length > 0;
  }

  private async nodeFloor(nodeId: string) {
    const rows = await this.db.query<{ floor_id: string }>(
      'select floor_id from route_nodes where venue_id = $1 and id = $2',
      [this.venueId, nodeId],
    );
    return rows[0]?.floor_id ?? null;
  }

  private async checkLinks(resource: TableResource, item: Record<string, unknown>) {
    const issues: { path: string; message: string }[] = [];
    const need = async (path: string, target: TableResource, id: unknown, message: string) => {
      if (!(await this.exists(target, String(id ?? '')))) issues.push({ path, message });
    };
    switch (resource) {
      case 'tenants': {
        await need('categoryId', 'categories', item.categoryId, 'Choose an existing category.');
        await need('floorId', 'floors', item.floorId, 'Choose an existing floor.');
        const nodeFloor = await this.nodeFloor(String(item.nodeId));
        if (!nodeFloor)
          issues.push({
            path: 'nodeId',
            message: 'Choose an existing route node for the shop entrance.',
          });
        else if (nodeFloor !== item.floorId)
          issues.push({
            path: 'nodeId',
            message: 'The entrance node must be on the same floor as the tenant.',
          });
        const feature = await this.get<{ floorId: string }>('features', String(item.featureId));
        if (!feature) issues.push({ path: 'featureId', message: 'Choose an existing map unit.' });
        else if (feature.floorId !== item.floorId)
          issues.push({
            path: 'featureId',
            message: 'The map unit must be on the same floor as the tenant.',
          });
        break;
      }
      case 'pois': {
        await need('floorId', 'floors', item.floorId, 'Choose an existing floor.');
        const nodeFloor = await this.nodeFloor(String(item.nodeId));
        if (nodeFloor !== item.floorId)
          issues.push({
            path: 'nodeId',
            message: 'Place the amenity on a route node on the same floor.',
          });
        break;
      }
      case 'features':
      case 'nodes':
        await need('floorId', 'floors', item.floorId, 'Choose an existing floor.');
        break;
      case 'edges':
        await need('fromNode', 'nodes', item.fromNode, 'Start node does not exist.');
        await need('toNode', 'nodes', item.toNode, 'End node does not exist.');
        if (item.fromNode === item.toNode)
          issues.push({ path: 'toNode', message: 'An edge must connect two different nodes.' });
        break;
      case 'connectors':
        for (const [i, nodeId] of ((item.nodeIds as string[]) ?? []).entries())
          await need(`nodeIds.${i}`, 'nodes', nodeId, `Node ${nodeId} does not exist.`);
        break;
      case 'offers':
        await need('tenantId', 'tenants', item.tenantId, 'Choose an existing tenant.');
        if (String(item.end) < String(item.start))
          issues.push({ path: 'end', message: 'End date must be on or after the start date.' });
        break;
      case 'events':
        if (
          item.destinationId &&
          !(await this.exists('tenants', String(item.destinationId))) &&
          !(await this.exists('pois', String(item.destinationId)))
        )
          issues.push({
            path: 'destinationId',
            message: 'Choose an existing tenant or amenity for directions.',
          });
        if (String(item.end) < String(item.start))
          issues.push({ path: 'end', message: 'End date must be on or after the start date.' });
        break;
      case 'campaigns': {
        await need('mediaId', 'media', item.mediaId, 'Choose a media asset from the library.');
        if (String(item.endDate) < String(item.startDate))
          issues.push({ path: 'endDate', message: 'End date must be on or after the start date.' });
        const targets = (item.targets as string[]) ?? [];
        if (item.targetType !== 'ALL' && targets.length === 0)
          issues.push({ path: 'targets', message: 'Pick at least one target.' });
        if (item.targetType === 'FLOOR')
          for (const id of targets)
            await need('targets', 'floors', id, `Floor ${id} does not exist.`);
        if (item.targetType === 'DEVICE')
          for (const id of targets)
            await need('targets', 'devices', id, `Device ${id} does not exist.`);
        if (
          item.tapDestinationId &&
          !(await this.exists('tenants', String(item.tapDestinationId))) &&
          !(await this.exists('pois', String(item.tapDestinationId)))
        )
          issues.push({
            path: 'tapDestinationId',
            message: 'Choose an existing tenant or amenity.',
          });
        break;
      }
      case 'devices': {
        await need('floorId', 'floors', item.floorId, 'Choose an existing floor.');
        const nodeFloor = await this.nodeFloor(String(item.routeStartNode));
        if (nodeFloor !== item.floorId)
          issues.push({
            path: 'routeStartNode',
            message: 'The kiosk start node must be on the kiosk floor.',
          });
        break;
      }
      default:
        break;
    }
    if (issues.length) throw badRequest('Some links need attention.', issues);
  }
}

export type { TableDef };
