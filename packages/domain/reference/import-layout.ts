import { schemas, type Snapshot, type RouteNode, type Feature } from '../index';
import { corridor, referenceStores } from './reference-layout';
import { upperStores, upperAnchors } from './upper-floor-layout';

// The supplied presentation floor, sampled into editable native polygons.
export const referenceOutlinePoints: [number, number][] = [
  [193, 57],
  [375, 54],
  [532, 23],
  [593, 40],
  [669, 151],
  [728, 107],
  [819, 226],
  [758, 273],
  [827, 366],
  [825, 449],
  [758, 578],
  [684, 806],
  [579, 797],
  [495, 937],
  [361, 888],
  [451, 641],
  [491, 617],
  [551, 465],
  ...Array.from({ length: 8 }, (_, i): [number, number] => {
    const t = (i + 1) / 8;
    return [
      (1 - t) ** 2 * 551 + 2 * (1 - t) * t * 581 + t * t * 529,
      (1 - t) ** 2 * 465 + 2 * (1 - t) * t * 371 + t * t * 312,
    ];
  }),
  ...Array.from({ length: 8 }, (_, i): [number, number] => {
    const t = (i + 1) / 8;
    return [
      (1 - t) ** 2 * 529 + 2 * (1 - t) * t * 475 + t * t * 398,
      (1 - t) ** 2 * 312 + 2 * (1 - t) * t * 259 + t * t * 269,
    ];
  }),
  [319, 287],
  [270, 287],
  [222, 281],
  [182, 267],
  [151, 246],
  [132, 231],
  [122, 213],
  [120, 195],
  [123, 176],
  [153, 119],
];

export function hasReferenceLayout(data: Pick<Snapshot, 'nodes'>) {
  return data.nodes.some((node) => node.id === 'reference-l0-c-0');
}

/** One-time conversion; retains existing tenant, device, campaign and destination IDs. */
export function importReferenceLayout(source: Snapshot): Snapshot {
  if (hasReferenceLayout(source)) return structuredClone(source);
  const data = structuredClone(source);
  if (!data.floors.some((f) => f.id === 'l0'))
    throw new Error('Reference import requires the Riverside demo floors.');
  const originalNodes = [...data.nodes];
  const originalFeatures = new Set(data.features.map((f) => f.id));
  const originalTenants = new Set(data.tenants.map((t) => t.id));
  for (const floor of data.floors) {
    if (floor.id === 'l0')
      Object.assign(floor, { name: 'Ground Floor', shortName: 'G', level: 0, sortOrder: 0 });
    if (floor.id === 'l1')
      Object.assign(floor, { name: 'Level 1', shortName: 'L1', level: 1, sortOrder: 1 });
    if (floor.id === 'l2')
      Object.assign(floor, { name: 'Level 2', shortName: 'L2', level: 2, sortOrder: 2 });
  }
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const featureById = new Map(data.features.map((f) => [f.id, f]));
  function addNode(
    input: Partial<RouteNode> & Pick<RouteNode, 'id' | 'floorId' | 'x' | 'y' | 'type' | 'label'>,
  ) {
    const node = schemas.nodes.parse(input);
    data.nodes.push(node);
    nodeById.set(node.id, node);
    return node;
  }
  function addFeature(input: Feature) {
    data.features.push(input);
    featureById.set(input.id, input);
  }
  function connect(
    a: RouteNode,
    b: RouteNode,
    type: 'corridor' | 'lift' | 'escalator' | 'stairs' = 'corridor',
  ) {
    const distance = type === 'corridor' ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y) * 0.3) : 5;
    data.edges.push(
      schemas.edges.parse({
        id: `reference-edge-${data.edges.length}`,
        fromNode: a.id,
        toNode: b.id,
        distance,
        type,
        weight: 1,
        direction: 'BOTH',
        active: true,
        accessible: type !== 'stairs' && type !== 'escalator',
        restricted: false,
        estimatedTime: type === 'lift' ? 35 : type === 'corridor' ? distance / 1.2 : 20,
        reason: 'Imported reference map',
      }),
    );
  }
  // Keep original edges for recovery, but route along the new continuous concourse.
  for (const edge of data.edges) {
    if (nodeById.get(edge.fromNode)?.floorId === nodeById.get(edge.toNode)?.floorId)
      edge.active = false;
  }
  for (const floor of data.floors) {
    const previousWidth = floor.width,
      previousHeight = floor.height;
    Object.assign(floor, {
      width: 960,
      height: 1020,
      metresPerUnit: 0.3,
      outline: referenceOutlinePoints,
    });
    const corridorNodes = corridor.map(([x, y], index) =>
      addNode({
        id: `reference-${floor.id}-c-${index}`,
        floorId: floor.id,
        x,
        y,
        label: 'Mall corridor',
        type: 'corridor',
      }),
    );
    corridorNodes.slice(1).forEach((node, i) => connect(corridorNodes[i], node));
    const nearest = (node: RouteNode) =>
      corridorNodes.reduce((best, candidate) =>
        Math.hypot(candidate.x - node.x, candidate.y - node.y) <
        Math.hypot(best.x - node.x, best.y - node.y)
          ? candidate
          : best,
      );
    // Existing amenities and connector IDs survive so offers, devices and signed GO routes remain linked.
    for (const node of originalNodes.filter((n) => n.floorId === floor.id)) {
      const index = Math.min(
        corridor.length - 1,
        Math.max(
          0,
          Math.round(
            ((node.y / previousHeight) * 0.7 + (node.x / previousWidth) * 0.3) *
              (corridor.length - 1),
          ),
        ),
      );
      const point = corridor[index];
      node.x = point[0];
      node.y = point[1];
      if (node.type === 'lift') {
        node.x = node.id.includes('west') ? 255 : 650;
        node.y = node.id.includes('west') ? 170 : 320;
      }
      if (node.type === 'escalator') {
        node.x = node.id.includes('-w-') ? 290 : 675;
        node.y = (node.id.includes('-w-') ? 165 : 490) + (node.id.includes('down') ? 25 : 0);
      }
      if (node.type === 'stairs') {
        node.x = node.id.includes('west') ? 310 : 600;
        node.y = node.id.includes('west') ? 180 : 575;
      }
      if (node.type === 'kiosk') {
        node.x = 428;
        node.y = 884;
      }
    }
    const stores =
      floor.level === 0
        ? [
            ...referenceStores,
            {
              id: 'zara-anchor',
              name: 'Zara',
              x: 556,
              y: 78,
              category: 'fashion',
              color: '#b55787',
            },
            {
              id: 'sephora-anchor',
              name: 'Sephora',
              x: 735,
              y: 203,
              category: 'beauty',
              color: '#446d94',
            },
          ]
        : [
            ...upperStores.filter((s) => s.floorId === floor.id),
            ...(upperAnchors[floor.id as keyof typeof upperAnchors] ?? []).map((name, i) => ({
              id: `${floor.id}-anchor-${i}`,
              name,
              x: [556, 735, 385][i],
              y: [78, 203, 748][i],
              category: 'fashion',
              color: '#b55787',
            })),
          ];
    const assigned = new Set<string>();
    for (const store of stores) {
      let tenant = data.tenants.find(
        (t) => t.floorId === floor.id && t.name.toLowerCase() === store.name.toLowerCase(),
      );
      if (!tenant) {
        const id = `ref-${store.id}`;
        const matchingBrand = data.tenants.find(
          (candidate) => candidate.name.toLowerCase() === store.name.toLowerCase(),
        );
        tenant = schemas.tenants.parse({
          ...(matchingBrand ?? data.tenants[0]),
          id,
          floorId: floor.id,
          name: store.name,
          tradingName: store.name,
          categoryId: store.category,
          nodeId: id,
          featureId: id,
          unitNumber: store.id,
          shortSummary: matchingBrand?.shortSummary ?? '',
          description: matchingBrand?.description ?? `${store.name} · ${floor.name}`,
          keywords: matchingBrand?.keywords ?? [store.name.toLowerCase()],
          productTypes: matchingBrand?.productTypes ?? [],
          services: matchingBrand?.services ?? [],
          brands: matchingBrand?.brands ?? [],
          logo: matchingBrand?.logo ?? '',
          heroImage: matchingBrand?.heroImage ?? '',
          gallery: matchingBrand?.gallery ?? [],
          phone: '',
          website: '',
          brandColor: store.color,
          status: 'ACTIVE',
          dining: null,
          cinema: null,
          i18n: {},
          anchor: store.id.includes('anchor'),
          accessibilityNotes: '',
        });
        data.tenants.push(tenant);
        addNode({
          id,
          floorId: floor.id,
          x: store.x,
          y: store.y,
          type: 'tenant',
          label: tenant.name,
        });
      }
      assigned.add(tenant.id);
      Object.assign(nodeById.get(tenant.nodeId)!, { x: store.x, y: store.y });
    }
    let extraIndex = 0;
    for (const tenant of data.tenants.filter((t) => t.floorId === floor.id)) {
      const node = nodeById.get(tenant.nodeId)!;
      if (!assigned.has(tenant.id)) {
        const index = 2 + ((extraIndex++ * 2) % 19);
        const a = corridor[index],
          b = corridor[index + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        node.x = (a[0] + b[0]) / 2 - ((b[1] - a[1]) / length) * 55;
        node.y = (a[1] + b[1]) / 2 + ((b[0] - a[0]) / length) * 55;
      }
      const points: [number, number][] = [
        [node.x - 21, node.y - 16],
        [node.x + 22, node.y - 23],
        [node.x + 30, node.y + 13],
        [node.x - 14, node.y + 22],
      ];
      const feature = featureById.get(tenant.featureId);
      if (feature) Object.assign(feature, { points, color: '#f7f7f7' });
      else
        addFeature({
          id: tenant.featureId,
          floorId: floor.id,
          label: tenant.name,
          kind: 'unit',
          points,
          color: '#f7f7f7',
        });
    }
    // The traced concourse subdivision is stored as editable decorative geometry.
    corridor.slice(0, -1).forEach((a, i) => {
      const b = corridor[i + 1],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy),
        nx = -dy / length,
        ny = dx / length;
      for (const side of [-1, 1])
        for (let j = 0; j < 3; j++) {
          const t = j / 3,
            u = (j + 1) / 3;
          addFeature({
            id: `reference-unit-${floor.id}-${i}-${side + 1}-${j}`,
            floorId: floor.id,
            label: 'Concourse unit',
            kind: 'decor',
            color: '#f7f7f7',
            points: [
              [a[0] + dx * t + nx * side * 24, a[1] + dy * t + ny * side * 24],
              [a[0] + dx * u + nx * side * 24, a[1] + dy * u + ny * side * 24],
              [a[0] + dx * u + nx * side * 94, a[1] + dy * u + ny * side * 94],
              [a[0] + dx * t + nx * side * 94, a[1] + dy * t + ny * side * 94],
            ],
          });
        }
    });
    // Retain editable amenity features at their new node locations; retire old background shapes.
    for (const feature of data.features.filter(
      (f) =>
        f.floorId === floor.id &&
        originalFeatures.has(f.id) &&
        !data.tenants.some((t) => t.featureId === f.id),
    )) {
      const poi = data.pois.find((p) => p.featureId === feature.id);
      const node = poi && nodeById.get(poi.nodeId);
      if (node)
        feature.points = [
          [node.x - 10, node.y - 10],
          [node.x + 10, node.y - 10],
          [node.x + 10, node.y + 10],
          [node.x - 10, node.y + 10],
        ];
      else {
        feature.kind = 'void';
        feature.points = [
          [-100, -100],
          [-99, -100],
          [-99, -99],
        ];
      }
    }
    for (const node of data.nodes.filter(
      (n) => n.floorId === floor.id && !n.id.startsWith(`reference-${floor.id}-c-`),
    ))
      connect(node, nearest(node));
  }
  // Validate all imported records against the same contracts used by COMMAND.
  for (const resource of [
    'floors',
    'features',
    'nodes',
    'edges',
    'connectors',
    'tenants',
  ] as const) {
    for (const item of data[resource]) schemas[resource].parse(item);
  }
  if (data.tenants.filter((t) => originalTenants.has(t.id)).length !== originalTenants.size)
    throw new Error('Import lost an existing tenant');
  return data;
}
