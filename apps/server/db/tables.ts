import type { ContentResource } from '../../../packages/domain';

export type ColumnType = 'text' | 'int' | 'real' | 'bool' | 'json' | 'jsonNullable';

export interface TableDef {
  resource: ContentResource;
  table: string;
  /** [domain field, SQL column, type] */
  columns: [string, string, ColumnType][];
  orderBy: string;
  label: string;
}

const t = (
  field: string,
  column: string,
  type: ColumnType = 'text',
): [string, string, ColumnType] => [field, column, type];

export const tables: Record<Exclude<ContentResource, 'venue'>, TableDef> = {
  floors: {
    resource: 'floors',
    table: 'floors',
    label: 'Floor',
    orderBy: 'sort_order, level',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('shortName', 'short_name'),
      t('theme', 'theme'),
      t('level', 'level', 'int'),
      t('width', 'width', 'real'),
      t('height', 'height', 'real'),
      t('metresPerUnit', 'metres_per_unit', 'real'),
      t('outline', 'outline', 'json'),
      t('sortOrder', 'sort_order', 'int'),
    ],
  },
  categories: {
    resource: 'categories',
    table: 'categories',
    label: 'Category',
    orderBy: 'sort_order, name',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('icon', 'icon'),
      t('color', 'color'),
      t('sortOrder', 'sort_order', 'int'),
      t('primary', 'is_primary', 'bool'),
      t('synonyms', 'synonyms', 'json'),
    ],
  },
  features: {
    resource: 'features',
    table: 'map_features',
    label: 'Map feature',
    orderBy: 'floor_id, id',
    columns: [
      t('id', 'id'),
      t('floorId', 'floor_id'),
      t('label', 'label'),
      t('kind', 'kind'),
      t('points', 'points', 'json'),
      t('color', 'color'),
    ],
  },
  nodes: {
    resource: 'nodes',
    table: 'route_nodes',
    label: 'Route node',
    orderBy: 'floor_id, id',
    columns: [
      t('id', 'id'),
      t('floorId', 'floor_id'),
      t('x', 'x', 'real'),
      t('y', 'y', 'real'),
      t('label', 'label'),
      t('type', 'type'),
      t('connectorId', 'connector_id'),
      t('landmark', 'landmark', 'bool'),
    ],
  },
  edges: {
    resource: 'edges',
    table: 'route_edges',
    label: 'Route edge',
    orderBy: 'id',
    columns: [
      t('id', 'id'),
      t('fromNode', 'from_node'),
      t('toNode', 'to_node'),
      t('distance', 'distance', 'real'),
      t('type', 'type'),
      t('weight', 'weight', 'real'),
      t('direction', 'direction'),
      t('active', 'active', 'bool'),
      t('accessible', 'accessible', 'bool'),
      t('restricted', 'restricted', 'bool'),
      t('estimatedTime', 'estimated_time', 'real'),
      t('reason', 'reason'),
    ],
  },
  connectors: {
    resource: 'connectors',
    table: 'vertical_connectors',
    label: 'Vertical connector',
    orderBy: 'id',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('type', 'type'),
      t('direction', 'direction'),
      t('accessible', 'accessible', 'bool'),
      t('nodeIds', 'node_ids', 'json'),
    ],
  },
  tenants: {
    resource: 'tenants',
    table: 'tenants',
    label: 'Tenant',
    orderBy: 'name',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('tradingName', 'trading_name'),
      t('categoryId', 'category_id'),
      t('subcategory', 'subcategory'),
      t('floorId', 'floor_id'),
      t('unitNumber', 'unit_number'),
      t('nodeId', 'node_id'),
      t('featureId', 'feature_id'),
      t('shortSummary', 'short_summary'),
      t('description', 'description'),
      t('keywords', 'keywords', 'json'),
      t('productTypes', 'product_types', 'json'),
      t('services', 'services', 'json'),
      t('brands', 'brands', 'json'),
      t('logo', 'logo'),
      t('heroImage', 'hero_image'),
      t('gallery', 'gallery', 'json'),
      t('brandColor', 'brand_color'),
      t('hours', 'hours', 'json'),
      t('phone', 'phone'),
      t('website', 'website'),
      t('accessibilityNotes', 'accessibility_notes'),
      t('status', 'status'),
      t('anchor', 'anchor', 'bool'),
      t('dining', 'dining', 'jsonNullable'),
      t('cinema', 'cinema', 'jsonNullable'),
      t('i18n', 'i18n', 'json'),
    ],
  },
  pois: {
    resource: 'pois',
    table: 'pois',
    label: 'Amenity',
    orderBy: 'floor_id, type, name',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('type', 'type'),
      t('floorId', 'floor_id'),
      t('nodeId', 'node_id'),
      t('featureId', 'feature_id'),
      t('accessible', 'accessible', 'bool'),
      t('description', 'description'),
      t('hours', 'hours'),
      t('status', 'status'),
    ],
  },
  offers: {
    resource: 'offers',
    table: 'offers',
    label: 'Offer',
    orderBy: 'start_date desc, title',
    columns: [
      t('id', 'id'),
      t('tenantId', 'tenant_id'),
      t('title', 'title'),
      t('highlight', 'highlight'),
      t('description', 'description'),
      t('image', 'image'),
      t('start', 'start_date'),
      t('end', 'end_date'),
      t('terms', 'terms'),
      t('status', 'status'),
    ],
  },
  events: {
    resource: 'events',
    table: 'events',
    label: 'Event',
    orderBy: 'start_date, title',
    columns: [
      t('id', 'id'),
      t('title', 'title'),
      t('description', 'description'),
      t('image', 'image'),
      t('start', 'start_date'),
      t('end', 'end_date'),
      t('timeLabel', 'time_label'),
      t('destinationId', 'destination_id'),
      t('locationLabel', 'location_label'),
      t('status', 'status'),
    ],
  },
  campaigns: {
    resource: 'campaigns',
    table: 'campaigns',
    label: 'Campaign',
    orderBy: 'start_date desc, name',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('advertiser', 'advertiser'),
      t('description', 'description'),
      t('status', 'status'),
      t('startDate', 'start_date'),
      t('endDate', 'end_date'),
      t('startTime', 'start_time'),
      t('endTime', 'end_time'),
      t('daysOfWeek', 'days_of_week', 'json'),
      t('mediaId', 'media_id'),
      t('duration', 'duration', 'int'),
      t('priority', 'priority'),
      t('targetType', 'target_type'),
      t('targets', 'targets', 'json'),
      t('tapDestinationId', 'tap_destination_id'),
      t('notes', 'notes'),
    ],
  },
  devices: {
    resource: 'devices',
    table: 'devices',
    label: 'Device',
    orderBy: 'id',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('floorId', 'floor_id'),
      t('locationDescription', 'location_description'),
      t('routeStartNode', 'route_start_node'),
      t('deviceGroup', 'device_group'),
      t('screenOrientation', 'screen_orientation'),
      t('status', 'status'),
      t('idleTimeout', 'idle_timeout', 'int'),
      t('defaultLanguage', 'default_language'),
    ],
  },
  media: {
    resource: 'media',
    table: 'media_assets',
    label: 'Media asset',
    orderBy: 'created_at desc',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('url', 'url'),
      t('mimeType', 'mime_type'),
      t('size', 'size', 'int'),
      t('width', 'width', 'int'),
      t('height', 'height', 'int'),
      t('duration', 'duration', 'real'),
      t('kind', 'kind'),
    ],
  },
};

export const venueColumns: [string, string, ColumnType][] = [
  t('id', 'id'),
  t('name', 'name'),
  t('timezone', 'timezone'),
  t('address', 'address'),
  t('description', 'description'),
  t('brandColor', 'brand_color'),
  t('phone', 'phone'),
  t('email', 'email'),
  t('website', 'website'),
  t('openingHours', 'opening_hours'),
  t('defaultLanguage', 'default_language'),
  t('languages', 'languages', 'json'),
];

export function toRow(columns: TableDef['columns'], item: Record<string, unknown>) {
  return columns.map(([field, , type]) => {
    const value = item[field];
    if (type === 'json') return JSON.stringify(value ?? null);
    if (type === 'jsonNullable')
      return value === null || value === undefined ? null : JSON.stringify(value);
    return value;
  });
}

export function placeholders(columns: TableDef['columns'], offset = 0) {
  return columns.map(([, , type], i) =>
    type === 'json' || type === 'jsonNullable' ? `$${i + 1 + offset}::jsonb` : `$${i + 1 + offset}`,
  );
}

export function fromRow<T>(columns: TableDef['columns'], row: Record<string, unknown>): T {
  const item: Record<string, unknown> = {};
  for (const [field, column, type] of columns) {
    let value = row[column];
    if ((type === 'json' || type === 'jsonNullable') && typeof value === 'string')
      value = JSON.parse(value);
    if ((type === 'int' || type === 'real') && typeof value === 'string') value = Number(value);
    item[field] = value;
  }
  return item as T;
}
