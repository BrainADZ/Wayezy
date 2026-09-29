import type {
  Campaign,
  Category,
  Device,
  Event,
  Feature,
  Floor,
  Media,
  Offer,
  Poi,
  RouteEdge,
  RouteNode,
  Snapshot,
  Tenant,
  Venue,
  VerticalConnector,
} from '../index';
import { dailyHours } from '../index';
import { buildFloorGraph, type Attachment } from './graph';
import {
  ATRIUM_OUTLINE,
  BUILDING_OUTLINE,
  CIRCULATION,
  FLOOR_HEIGHT,
  FLOOR_WIDTH,
  METRES_PER_UNIT,
  SLOTS,
  type SlotId,
} from './layout';
import { demoTenants } from './tenants';

export { demoTenants } from './tenants';
export * as layout from './layout';

export const DEMO_VERSION = '2026.09.17.1';

const venue: Venue = {
  id: 'riverside',
  name: 'Riverside Shopping Centre',
  timezone: 'Asia/Kolkata',
  address: 'Outer Ring Road, Bellandur, Bengaluru 560103',
  description: 'Three floors of fashion, dining, cinema and everyday essentials.',
  brandColor: '#1a5cff',
  phone: '+91 80 4000 1200',
  email: 'hello@riverside.example',
  website: 'https://example.com/riverside',
  openingHours: 'Mon–Thu 10:00–22:00 · Fri–Sun 10:00–23:00',
  defaultLanguage: 'en',
  languages: ['en', 'hi'],
};

export const floorThemes: Record<string, { code: string; theme: string; accent: string }> = {
  l0: { code: 'L0', theme: 'Entrance & Essentials', accent: '#1a5cff' },
  l1: { code: 'L1', theme: 'Fashion & Lifestyle', accent: '#e8457a' },
  l2: { code: 'L2', theme: 'Cinema & Dining', accent: '#f08c1a' },
};

const floorNames = [
  { name: 'Ground Floor', shortName: 'G' },
  { name: 'Level 1', shortName: 'L1' },
  { name: 'Level 2', shortName: 'L2' },
] as const;

const floors: Floor[] = (['l0', 'l1', 'l2'] as const).map((id, level) => ({
  id,
  name: floorNames[level].name,
  shortName: floorNames[level].shortName,
  theme: floorThemes[id].theme,
  level,
  width: FLOOR_WIDTH,
  height: FLOOR_HEIGHT,
  metresPerUnit: METRES_PER_UNIT,
  outline: BUILDING_OUTLINE,
  sortOrder: level,
}));

const categories: Category[] = [
  {
    id: 'fashion',
    name: 'Fashion',
    icon: 'fashion',
    color: '#e8457a',
    sortOrder: 1,
    primary: true,
    synonyms: ['clothes', 'clothing', 'apparel', 'wear'],
  },
  {
    id: 'dining',
    name: 'Dining',
    icon: 'dining',
    color: '#f08c1a',
    sortOrder: 2,
    primary: true,
    synonyms: ['food', 'restaurant', 'eat', 'lunch', 'dinner'],
  },
  {
    id: 'cinema',
    name: 'Cinema',
    icon: 'cinema',
    color: '#7c4dff',
    sortOrder: 3,
    primary: true,
    synonyms: ['movie', 'movies', 'film', 'theatre'],
  },
  {
    id: 'beauty',
    name: 'Beauty',
    icon: 'beauty',
    color: '#d6336c',
    sortOrder: 4,
    primary: true,
    synonyms: ['makeup', 'cosmetics', 'skincare'],
  },
  {
    id: 'electronics',
    name: 'Electronics',
    icon: 'electronics',
    color: '#1a5cff',
    sortOrder: 5,
    primary: true,
    synonyms: ['gadgets', 'tech', 'mobile'],
  },
  {
    id: 'services',
    name: 'Services',
    icon: 'services',
    color: '#0e9f8a',
    sortOrder: 6,
    primary: true,
    synonyms: ['repair', 'help'],
  },
  {
    id: 'sports',
    name: 'Sports',
    icon: 'sports',
    color: '#16a34a',
    sortOrder: 7,
    primary: false,
    synonyms: ['fitness', 'gym'],
  },
  {
    id: 'home',
    name: 'Home & Lifestyle',
    icon: 'home',
    color: '#d4a017',
    sortOrder: 8,
    primary: false,
    synonyms: ['decor', 'furniture', 'gifts'],
  },
  {
    id: 'kids',
    name: 'Kids & Family',
    icon: 'kids',
    color: '#ff7a45',
    sortOrder: 9,
    primary: false,
    synonyms: ['children', 'toys'],
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: 'entertainment',
    color: '#5b5bd6',
    sortOrder: 10,
    primary: false,
    synonyms: ['games', 'fun'],
  },
  {
    id: 'grocery',
    name: 'Convenience',
    icon: 'grocery',
    color: '#2f9e44',
    sortOrder: 11,
    primary: false,
    synonyms: ['grocery', 'supermarket'],
  },
  {
    id: 'health',
    name: 'Health & Pharmacy',
    icon: 'health',
    color: '#0b7285',
    sortOrder: 12,
    primary: false,
    synonyms: ['pharmacy', 'chemist', 'medicine'],
  },
];

/** Pastel unit fills by category (map surfaces stay soft; icons carry the strong colour). */
export const unitColors: Record<string, string> = {
  fashion: '#f9d9e4',
  dining: '#ffe4cc',
  cinema: '#e4dcfb',
  beauty: '#fbdde8',
  electronics: '#d9e7fb',
  services: '#d9f0ea',
  sports: '#daf1df',
  home: '#fbefc9',
  kids: '#ffe2d6',
  entertainment: '#e2e0fb',
  grocery: '#e3f2d3',
  health: '#d5eef0',
  amenity: '#e6ecf4',
};

const hex = (n: number) => n.toString(16).padStart(2, '0');
/** Slightly vary pastel fills so neighbouring shops of one category remain distinguishable. */
function vary(color: string, index: number) {
  const shift = ((index % 3) - 1) * 6;
  const channel = (i: number) =>
    Math.max(0, Math.min(255, parseInt(color.slice(1 + i * 2, 3 + i * 2), 16) + shift));
  return `#${hex(channel(0))}${hex(channel(1))}${hex(channel(2))}`;
}

export function createDemoSnapshot(): Snapshot {
  const nodes: RouteNode[] = [];
  const edges: RouteEdge[] = [];
  const features: Feature[] = [];
  const tenants: Tenant[] = [];
  const pois: Poi[] = [];

  const slot = (id: SlotId) => SLOTS[id];
  const amenityUnit = (
    floorId: string,
    id: string,
    label: string,
    slotId: SlotId,
    kind: Feature['kind'] = 'amenity',
  ) =>
    features.push({
      id: `feature-${id}`,
      floorId,
      label,
      kind,
      points: slot(slotId).points,
      color: unitColors.amenity,
    });

  for (const floor of floors) {
    const f = floor.id;
    const attachments: Attachment[] = [];
    const floorTenants = demoTenants.filter((t) => t.floorId === f);

    floorTenants.forEach((t, index) => {
      attachments.push({
        id: `${f}-door-${t.id}`,
        point: slot(t.slot).door,
        label: t.name,
        type: 'tenant',
        landmark: Boolean(t.anchor),
      });
      features.push({
        id: `feature-${t.id}`,
        floorId: f,
        label: t.name,
        kind: 'unit',
        points: slot(t.slot).points,
        color: vary(unitColors[t.categoryId] ?? unitColors.amenity, index),
      });
    });

    // Service cores (washrooms + stairs) in the south-west and south-east corners.
    features.push({
      id: `feature-${f}-core-west`,
      floorId: f,
      label: 'Washrooms',
      kind: 'service',
      points: SLOTS.BL.points,
      color: unitColors.amenity,
    });
    features.push({
      id: `feature-${f}-core-east`,
      floorId: f,
      label: 'Washrooms & Lift',
      kind: 'service',
      points: SLOTS.BR.points,
      color: unitColors.amenity,
    });
    attachments.push(
      {
        id: `${f}-core-west`,
        point: SLOTS.BL.door,
        label: 'West washrooms lobby',
        type: 'corridor',
      },
      {
        id: `${f}-wc-west`,
        point: CIRCULATION.washroomWest,
        label: 'Washrooms',
        type: 'poi',
        via: `${f}-core-west`,
      },
      {
        id: `${f}-stairs-west`,
        point: CIRCULATION.stairsWest,
        label: 'West stairs',
        type: 'stairs',
        via: `${f}-core-west`,
        connectorId: 'stairs-west',
      },
      {
        id: `${f}-core-east`,
        point: SLOTS.BR.door,
        label: 'East washrooms lobby',
        type: 'corridor',
      },
      {
        id: `${f}-wc-east`,
        point: CIRCULATION.washroomEast,
        label: 'Washrooms',
        type: 'poi',
        via: `${f}-core-east`,
      },
      {
        id: `${f}-stairs-east`,
        point: CIRCULATION.stairsEast,
        label: 'East stairs',
        type: 'stairs',
        via: `${f}-core-east`,
        connectorId: 'stairs-east',
      },
      {
        id: `${f}-lift-east`,
        point: CIRCULATION.liftEast,
        label: 'East lift',
        type: 'lift',
        via: `${f}-core-east`,
        connectorId: 'lift-east',
      },
      {
        id: `${f}-lift-central`,
        point: CIRCULATION.liftCentral,
        label: 'Central glass lift',
        type: 'lift',
        connectorId: 'lift-central',
        landmark: true,
      },
      {
        id: `${f}-esc-w-up`,
        point: CIRCULATION.escalatorWestUp,
        label: 'West escalator (up)',
        type: 'escalator',
        connectorId: 'esc-west-up',
      },
      {
        id: `${f}-esc-w-down`,
        point: CIRCULATION.escalatorWestDown,
        label: 'West escalator (down)',
        type: 'escalator',
        connectorId: 'esc-west-down',
      },
      {
        id: `${f}-esc-e-up`,
        point: CIRCULATION.escalatorEastUp,
        label: 'East escalator (up)',
        type: 'escalator',
        connectorId: 'esc-east-up',
      },
      {
        id: `${f}-esc-e-down`,
        point: CIRCULATION.escalatorEastDown,
        label: 'East escalator (down)',
        type: 'escalator',
        connectorId: 'esc-east-down',
      },
    );

    const addPoi = (
      poi: Omit<Poi, 'floorId' | 'featureId' | 'hours' | 'status'> &
        Partial<Pick<Poi, 'featureId' | 'hours'>>,
    ) => pois.push({ featureId: '', hours: '', status: 'ACTIVE', floorId: f, ...poi });
    addPoi({
      id: `${f}-washroom-west`,
      name: 'Washrooms',
      type: 'Washroom',
      nodeId: `${f}-wc-west`,
      accessible: true,
      description: "Men's and women's washrooms in the west core.",
    });
    addPoi({
      id: `${f}-accessible-washroom-west`,
      name: 'Accessible washroom',
      type: 'AccessibleWashroom',
      nodeId: `${f}-wc-west`,
      accessible: true,
      description: 'Step-free, wheelchair-accessible washroom with grab rails.',
    });
    addPoi({
      id: `${f}-washroom-east`,
      name: 'Washrooms',
      type: 'Washroom',
      nodeId: `${f}-wc-east`,
      accessible: true,
      description: "Men's and women's washrooms in the east core.",
    });
    addPoi({
      id: `${f}-accessible-washroom-east`,
      name: 'Accessible washroom',
      type: 'AccessibleWashroom',
      nodeId: `${f}-wc-east`,
      accessible: true,
      description: 'Step-free, wheelchair-accessible washroom with grab rails.',
    });
    addPoi({
      id: `${f}-lift-central`,
      name: 'Central glass lift',
      type: 'Lift',
      nodeId: `${f}-lift-central`,
      accessible: true,
      description: 'Serves L0, L1 and L2 beside the central atrium.',
    });
    addPoi({
      id: `${f}-lift-east`,
      name: 'East lift',
      type: 'Lift',
      nodeId: `${f}-lift-east`,
      accessible: true,
      description: 'Serves all floors from the east core.',
    });
    addPoi({
      id: `${f}-escalator-west`,
      name: 'West escalators',
      type: 'Escalator',
      nodeId: `${f}-esc-w-up`,
      accessible: false,
      description: 'Up and down escalators at the west end of the atrium.',
    });
    addPoi({
      id: `${f}-escalator-east`,
      name: 'East escalators',
      type: 'Escalator',
      nodeId: `${f}-esc-e-up`,
      accessible: false,
      description: 'Up and down escalators at the east end of the atrium.',
    });
    addPoi({
      id: `${f}-stairs-west`,
      name: 'West stairs',
      type: 'Stairs',
      nodeId: `${f}-stairs-west`,
      accessible: false,
      description: 'Stairs in the west core.',
    });
    addPoi({
      id: `${f}-stairs-east`,
      name: 'East stairs',
      type: 'Stairs',
      nodeId: `${f}-stairs-east`,
      accessible: false,
      description: 'Stairs in the east core.',
    });

    if (f === 'l0') {
      features.push({
        id: 'feature-l0-atrium',
        floorId: f,
        label: 'Central Atrium',
        kind: 'decor',
        points: ATRIUM_OUTLINE,
        color: '#dff1ea',
      });
      amenityUnit(f, 'l0-customer-care', 'Customer Care', 'B2');
      amenityUnit(f, 'l0-atm-lobby', 'ATM Lobby', 'B4');
      amenityUnit(f, 'l0-baby-care', 'Baby Care', 'B5');
      attachments.push(
        {
          id: 'l0-information',
          point: [700, 700],
          label: 'Information desk',
          type: 'poi',
          landmark: true,
        },
        {
          id: 'l0-kiosk-k001',
          point: [700, 775],
          label: 'Main entrance kiosk',
          type: 'kiosk',
          via: 'l0-information',
        },
        {
          id: 'l0-main-entrance',
          point: [700, 856],
          label: 'Main Entrance',
          type: 'entrance',
          via: 'l0-kiosk-k001',
          edgeType: 'entrance',
        },
        { id: 'l0-kiosk-k002', point: [150, 460], label: 'Parking lobby kiosk', type: 'kiosk' },
        {
          id: 'l0-parking',
          point: [48, 460],
          label: 'Parking entrance',
          type: 'entrance',
          via: 'l0-kiosk-k002',
          edgeType: 'entrance',
        },
        {
          id: 'l0-taxi',
          point: [1352, 460],
          label: 'Taxi & pick-up',
          type: 'entrance',
          edgeType: 'entrance',
        },
        {
          id: 'l0-door-customer-care',
          point: SLOTS.B2.door,
          label: 'Customer Care',
          type: 'poi',
          landmark: true,
        },
        { id: 'l0-door-atm', point: SLOTS.B4.door, label: 'ATM lobby', type: 'poi' },
        { id: 'l0-door-baby-care', point: SLOTS.B5.door, label: 'Baby care room', type: 'poi' },
      );
      addPoi({
        id: 'l0-main-entrance',
        name: 'Main Entrance',
        type: 'Entrance',
        nodeId: 'l0-main-entrance',
        accessible: true,
        description: 'Step-free main entrance with drop-off bay.',
      });
      addPoi({
        id: 'l0-parking',
        name: 'Parking',
        type: 'Parking',
        nodeId: 'l0-parking',
        accessible: true,
        description: 'Basement parking P1–P3 with EV charging and accessible bays.',
        hours: '09:00–00:30',
      });
      addPoi({
        id: 'l0-taxi',
        name: 'Taxi & ride pick-up',
        type: 'Taxi',
        nodeId: 'l0-taxi',
        accessible: true,
        description: 'Taxi rank and app-ride pick-up at the east entrance.',
      });
      addPoi({
        id: 'l0-information',
        name: 'Information desk',
        type: 'Information',
        nodeId: 'l0-information',
        accessible: true,
        description: 'Maps, lost & found, wheelchairs and strollers on request.',
        hours: '10:00–22:00',
      });
      addPoi({
        id: 'l0-customer-care',
        name: 'Customer Care',
        type: 'CustomerCare',
        nodeId: 'l0-door-customer-care',
        featureId: 'feature-l0-customer-care',
        accessible: true,
        description: 'Gift cards, feedback, lost & found and visitor assistance.',
        hours: '10:00–22:00',
      });
      addPoi({
        id: 'l0-first-aid',
        name: 'First aid',
        type: 'FirstAid',
        nodeId: 'l0-door-customer-care',
        accessible: true,
        description: 'First-aid room inside Customer Care. Ask any staff member.',
      });
      addPoi({
        id: 'l0-atm',
        name: 'ATM lobby',
        type: 'ATM',
        nodeId: 'l0-door-atm',
        featureId: 'feature-l0-atm-lobby',
        accessible: true,
        description: 'Three bank ATMs, open during mall hours.',
      });
      addPoi({
        id: 'l0-baby-care',
        name: 'Baby care room',
        type: 'BabyCare',
        nodeId: 'l0-door-baby-care',
        featureId: 'feature-l0-baby-care',
        accessible: true,
        description: 'Feeding room, changing tables and a bottle warmer.',
      });
    } else {
      features.push({
        id: `feature-${f}-atrium`,
        floorId: f,
        label: 'Atrium',
        kind: 'void',
        points: ATRIUM_OUTLINE,
        color: '#dfe9f2',
      });
    }
    if (f === 'l1') {
      attachments.push(
        { id: 'l1-kiosk-k003', point: [620, 655], label: 'Central atrium kiosk', type: 'kiosk' },
        { id: 'l1-atm', point: [1040, 252], label: 'ATM', type: 'poi' },
      );
      addPoi({
        id: 'l1-atm',
        name: 'ATM',
        type: 'ATM',
        nodeId: 'l1-atm',
        accessible: true,
        description: 'Free-standing ATM near Apple.',
      });
    }
    if (f === 'l2') {
      attachments.push(
        { id: 'l2-kiosk-k004', point: [860, 655], label: 'Food court kiosk', type: 'kiosk' },
        { id: 'l2-atm', point: [560, 660], label: 'ATM', type: 'poi' },
        {
          id: 'l2-prayer-room',
          point: [1300, 805],
          label: 'Prayer room',
          type: 'poi',
          via: 'l2-core-east',
        },
      );
      addPoi({
        id: 'l2-atm',
        name: 'ATM',
        type: 'ATM',
        nodeId: 'l2-atm',
        accessible: true,
        description: 'ATM beside the food court.',
      });
      addPoi({
        id: 'l2-prayer-room',
        name: 'Prayer room',
        type: 'PrayerRoom',
        nodeId: 'l2-prayer-room',
        accessible: true,
        description: 'Quiet multi-faith prayer room with ablution area.',
      });
    }

    const graph = buildFloorGraph(f, attachments);
    nodes.push(...graph.nodes);
    edges.push(...graph.edges);

    floorTenants.forEach((t) => {
      tenants.push({
        id: t.id,
        name: t.name,
        tradingName: t.name,
        categoryId: t.categoryId,
        subcategory: t.subcategory,
        floorId: f,
        unitNumber: t.unitNumber,
        nodeId: `${f}-door-${t.id}`,
        featureId: `feature-${t.id}`,
        shortSummary: t.shortSummary,
        description: t.description,
        keywords: t.keywords,
        productTypes: t.productTypes,
        services: t.services,
        brands: t.brands ?? [],
        logo: t.logo ?? '',
        heroImage: t.heroImage ?? '',
        gallery: [],
        brandColor: t.brandColor,
        hours: t.hours ?? dailyHours('10:00', '22:00', { open: '10:00', close: '23:00' }),
        phone: `+91 80 4000 ${1300 + tenants.length}`,
        website: '',
        accessibilityNotes:
          t.accessibilityNotes ?? 'Step-free access from the corridor. Lifts serve every floor.',
        status: t.status ?? 'ACTIVE',
        anchor: Boolean(t.anchor),
        dining: t.dining ?? null,
        cinema: t.cinema ?? null,
        i18n: t.hi ? { hi: t.hi } : {},
      });
    });
  }

  // Vertical connectors. Lifts are two-way and step-free; escalators run one way; stairs are not step-free.
  const levels = floors.map((f) => f.id);
  const connectors: VerticalConnector[] = [
    {
      id: 'lift-central',
      name: 'Central glass lift',
      type: 'lift',
      direction: 'BOTH',
      accessible: true,
      nodeIds: levels.map((f) => `${f}-lift-central`),
    },
    {
      id: 'lift-east',
      name: 'East lift',
      type: 'lift',
      direction: 'BOTH',
      accessible: true,
      nodeIds: levels.map((f) => `${f}-lift-east`),
    },
    {
      id: 'esc-west-up',
      name: 'West escalator (up)',
      type: 'escalator',
      direction: 'UP',
      accessible: false,
      nodeIds: levels.map((f) => `${f}-esc-w-up`),
    },
    {
      id: 'esc-west-down',
      name: 'West escalator (down)',
      type: 'escalator',
      direction: 'DOWN',
      accessible: false,
      nodeIds: levels.map((f) => `${f}-esc-w-down`),
    },
    {
      id: 'esc-east-up',
      name: 'East escalator (up)',
      type: 'escalator',
      direction: 'UP',
      accessible: false,
      nodeIds: levels.map((f) => `${f}-esc-e-up`),
    },
    {
      id: 'esc-east-down',
      name: 'East escalator (down)',
      type: 'escalator',
      direction: 'DOWN',
      accessible: false,
      nodeIds: levels.map((f) => `${f}-esc-e-down`),
    },
    {
      id: 'stairs-west',
      name: 'West stairs',
      type: 'stairs',
      direction: 'BOTH',
      accessible: false,
      nodeIds: levels.map((f) => `${f}-stairs-west`),
    },
    {
      id: 'stairs-east',
      name: 'East stairs',
      type: 'stairs',
      direction: 'BOTH',
      accessible: false,
      nodeIds: levels.map((f) => `${f}-stairs-east`),
    },
  ];
  const vertical = (
    id: string,
    from: string,
    to: string,
    type: RouteEdge['type'],
    distance: number,
    seconds: number,
    direction: RouteEdge['direction'],
    accessible: boolean,
  ): RouteEdge => ({
    id,
    fromNode: from,
    toNode: to,
    distance,
    type,
    weight: 1,
    direction,
    active: true,
    accessible,
    restricted: false,
    estimatedTime: seconds,
    reason: '',
  });
  for (const connector of connectors) {
    const ids = connector.nodeIds;
    if (connector.type === 'lift') {
      // A lift reaches any floor without getting out, so connect every pair (waiting time included).
      for (let a = 0; a < ids.length; a++)
        for (let b = a + 1; b < ids.length; b++)
          edges.push(
            vertical(
              `v-${connector.id}-${a}-${b}`,
              ids[a],
              ids[b],
              'lift',
              4.5 * (b - a),
              60 + 12 * (b - a),
              'BOTH',
              true,
            ),
          );
    } else {
      for (let a = 0; a < ids.length - 1; a++) {
        if (connector.type === 'escalator') {
          const [from, to] =
            connector.direction === 'DOWN' ? [ids[a + 1], ids[a]] : [ids[a], ids[a + 1]];
          edges.push(
            vertical(`v-${connector.id}-${a}`, from, to, 'escalator', 12, 20, 'FORWARD', false),
          );
        } else {
          edges.push(
            vertical(`v-${connector.id}-${a}`, ids[a], ids[a + 1], 'stairs', 9, 35, 'BOTH', false),
          );
        }
      }
    }
  }

  const today = '2026-09-01';
  const yearEnd = '2026-12-31';
  const media: Media[] = [
    {
      id: 'media-festive-fashion',
      name: 'festive-fashion-week.webp',
      url: '/demo/ads/festive-fashion-week.webp',
      mimeType: 'image/webp',
      size: 0,
      width: 1080,
      height: 1920,
      duration: 0,
      kind: 'image',
    },
    {
      id: 'media-olive-pasta',
      name: 'olive-pasta-nights.webp',
      url: '/demo/ads/olive-pasta-nights.webp',
      mimeType: 'image/webp',
      size: 0,
      width: 1080,
      height: 1920,
      duration: 0,
      kind: 'image',
    },
    {
      id: 'media-pvr-weekend',
      name: 'blockbuster-weekend.webm',
      url: '/demo/ads/blockbuster-weekend.webm',
      mimeType: 'video/webm',
      size: 0,
      width: 1080,
      height: 1920,
      duration: 12,
      kind: 'video',
    },
    {
      id: 'media-croma-techfest',
      name: 'tech-fest.webp',
      url: '/demo/ads/tech-fest.webp',
      mimeType: 'image/webp',
      size: 0,
      width: 1080,
      height: 1920,
      duration: 0,
      kind: 'image',
    },
    {
      id: 'media-riverside-house',
      name: 'riverside-house.webp',
      url: '/demo/ads/riverside-house.webp',
      mimeType: 'image/webp',
      size: 0,
      width: 1080,
      height: 1920,
      duration: 0,
      kind: 'image',
    },
  ];
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  const campaigns: Campaign[] = [
    {
      id: 'camp-festive-fashion',
      name: 'Festive Fashion Week',
      advertiser: 'Westside',
      description: 'Up to 40% off festive collections on Level 1.',
      status: 'ACTIVE',
      startDate: today,
      endDate: yearEnd,
      startTime: '00:00',
      endTime: '23:59',
      daysOfWeek: everyDay,
      mediaId: 'media-festive-fashion',
      duration: 10,
      priority: 'HIGH',
      targetType: 'ALL',
      targets: [],
      tapDestinationId: 'westside',
      notes: '',
    },
    {
      id: 'camp-olive-pasta',
      name: 'Pasta Nights',
      advertiser: 'Olive Trattoria',
      description: '20% off handmade pasta, Monday to Thursday.',
      status: 'ACTIVE',
      startDate: today,
      endDate: yearEnd,
      startTime: '00:00',
      endTime: '23:59',
      daysOfWeek: everyDay,
      mediaId: 'media-olive-pasta',
      duration: 10,
      priority: 'NORMAL',
      targetType: 'FLOOR',
      targets: ['l0', 'l2'],
      tapDestinationId: 'olive-trattoria',
      notes: 'Target ground-floor arrivals and diners.',
    },
    {
      id: 'camp-pvr-weekend',
      name: 'Blockbuster Weekend',
      advertiser: 'PVR Cinemas',
      description: 'New releases on the big screen this weekend.',
      status: 'ACTIVE',
      startDate: today,
      endDate: yearEnd,
      startTime: '00:00',
      endTime: '23:59',
      daysOfWeek: everyDay,
      mediaId: 'media-pvr-weekend',
      duration: 12,
      priority: 'NORMAL',
      targetType: 'ALL',
      targets: [],
      tapDestinationId: 'pvr',
      notes: 'Muted video loop.',
    },
    {
      id: 'camp-tech-fest',
      name: 'Tech Fest',
      advertiser: 'Croma',
      description: 'Festival deals on laptops and phones.',
      status: 'SCHEDULED',
      startDate: '2026-10-15',
      endDate: '2026-11-15',
      startTime: '10:00',
      endTime: '22:00',
      daysOfWeek: everyDay,
      mediaId: 'media-croma-techfest',
      duration: 10,
      priority: 'NORMAL',
      targetType: 'GROUP',
      targets: ['entrances'],
      tapDestinationId: 'croma',
      notes: '',
    },
  ];

  const offers: Offer[] = [
    {
      id: 'offer-zara-season',
      tenantId: 'zara',
      title: 'Season Special',
      highlight: 'FLAT 30% OFF',
      description: 'Flat 30% off on selected styles.',
      image: '/demo/stores/zara.webp',
      start: today,
      end: yearEnd,
      terms: 'On selected styles while stocks last.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-starbucks-bogo',
      tenantId: 'starbucks',
      title: 'Coffee Pair',
      highlight: 'BUY 1 GET 1 FREE',
      description: 'Buy one handcrafted beverage and get one free.',
      image: '/demo/stores/starbucks.webp',
      start: today,
      end: yearEnd,
      terms: 'On selected handcrafted beverages.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-olive-pasta',
      tenantId: 'olive-trattoria',
      title: 'Pasta Nights',
      highlight: '20% OFF',
      description: '20% off all handmade pasta, Monday to Thursday after 6 PM.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'Dine-in only. Not valid with other offers.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-pizza-express',
      tenantId: 'pizza-express',
      title: 'Two-for-Tuesday',
      highlight: 'BUY 1 GET 1',
      description: 'Buy one medium Romana pizza, get one free every Tuesday.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'Equal or lesser value. Dine-in and takeaway.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-westside',
      tenantId: 'westside',
      title: 'Festive edit',
      highlight: 'UP TO 40% OFF',
      description: 'Up to 40% off selected festive ethnic and western wear.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'On selected styles while stocks last.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-nike',
      tenantId: 'nike',
      title: 'Run season',
      highlight: '15% OFF',
      description: 'Extra 15% off running shoes for members.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'Free membership sign-up in store.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-sephora',
      tenantId: 'sephora',
      title: 'Beauty minis',
      highlight: 'FREE GIFT',
      description: 'Free deluxe mini with purchases over ₹3,000.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'One gift per bill.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-croma',
      tenantId: 'croma',
      title: 'Laptop upgrade days',
      highlight: 'NO-COST EMI',
      description: 'No-cost EMI up to 12 months on selected laptops.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'With selected bank cards.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-coffee-bean',
      tenantId: 'coffee-bean',
      title: 'Afternoon pick-me-up',
      highlight: '2ND HALF PRICE',
      description: 'Second drink half price between 3 and 6 PM.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'Lower-priced drink discounted.',
      status: 'ACTIVE',
    },
    {
      id: 'offer-pvr',
      tenantId: 'pvr',
      title: 'Weekday matinee',
      highlight: '₹199 TICKETS',
      description: 'Shows before 1 PM from ₹199, Monday to Thursday.',
      image: '',
      start: today,
      end: yearEnd,
      terms: 'Standard screens only.',
      status: 'ACTIVE',
    },
  ];

  const events: Event[] = [
    {
      id: 'event-acoustic',
      title: 'Acoustic Evenings',
      description: 'Live acoustic sets from local artists around the central atrium.',
      image: '',
      start: '2026-09-18',
      end: '2026-10-31',
      timeLabel: 'Fri–Sun · 6:00–8:00 PM',
      destinationId: 'l1-lift-central',
      locationLabel: 'Central Atrium · Level 1',
      status: 'ACTIVE',
    },
    {
      id: 'event-kids-craft',
      title: 'Kids Art & Craft Weekend',
      description: 'Free drop-in craft tables for ages 4–10: clay, paper lanterns and colouring.',
      image: '',
      start: '2026-09-26',
      end: '2026-09-27',
      timeLabel: 'Sat & Sun · 11:00 AM–4:00 PM',
      destinationId: 'funcity',
      locationLabel: 'FunCity Play Zone · L2-12',
      status: 'ACTIVE',
    },
    {
      id: 'event-festive-market',
      title: 'Festive Lights Market',
      description: 'Handmade diyas, gifts and sweets from 30 local makers at the main entrance.',
      image: '',
      start: '2026-10-10',
      end: '2026-10-25',
      timeLabel: 'Daily · 11:00 AM–9:00 PM',
      destinationId: 'l0-information',
      locationLabel: 'Entrance Hall · Level 0',
      status: 'ACTIVE',
    },
  ];

  const devices: Device[] = [
    {
      id: 'K-001',
      name: 'Kiosk 001 · Main Entrance',
      floorId: 'l0',
      locationDescription: 'L0 main entrance hall',
      routeStartNode: 'l0-kiosk-k001',
      deviceGroup: 'entrances',
      screenOrientation: 'PORTRAIT',
      status: 'ACTIVE',
      idleTimeout: 10,
      defaultLanguage: 'en',
    },
    {
      id: 'K-002',
      name: 'Kiosk 002 · Parking Lobby',
      floorId: 'l0',
      locationDescription: 'L0 west parking lobby',
      routeStartNode: 'l0-kiosk-k002',
      deviceGroup: 'entrances',
      screenOrientation: 'PORTRAIT',
      status: 'ACTIVE',
      idleTimeout: 10,
      defaultLanguage: 'en',
    },
    {
      id: 'K-003',
      name: 'Kiosk 003 · Central Atrium',
      floorId: 'l1',
      locationDescription: 'L1 central atrium',
      routeStartNode: 'l1-kiosk-k003',
      deviceGroup: 'atrium',
      screenOrientation: 'PORTRAIT',
      status: 'ACTIVE',
      idleTimeout: 10,
      defaultLanguage: 'en',
    },
    {
      id: 'K-004',
      name: 'Kiosk 004 · Food Court',
      floorId: 'l2',
      locationDescription: 'L2 food court',
      routeStartNode: 'l2-kiosk-k004',
      deviceGroup: 'dining',
      screenOrientation: 'PORTRAIT',
      status: 'MAINTENANCE',
      idleTimeout: 10,
      defaultLanguage: 'en',
    },
  ];

  return {
    version: DEMO_VERSION,
    publishedAt: '2026-09-17T06:00:00.000Z',
    venue: structuredClone(venue),
    floors: structuredClone(floors),
    categories: structuredClone(categories),
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
