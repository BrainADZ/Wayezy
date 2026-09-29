/**
 * Riverside Shopping Centre floor-plate geometry.
 *
 * All three floors share one structural grid so the atrium, lift shafts, escalators and
 * stair cores line up vertically. Plan units: 1 unit = 0.1 m (floor = 140 m × 90 m).
 *
 *   ┌──TL──┬─T1─┬─T2─┬─T3─┬─T4─┬─T5─┬──TR──┐
 *   │  L1  │       corridor ring        │  R1  │
 *   │      │   ┌──── atrium void ────┐  │      │
 *   │  L2  │ esc└─────────────────────┘esc   R2 │
 *   ├──BL──┴─B1─┴─B2─┴─B3─┴─B4─┴─B5─┴──BR──┤
 *
 * Corner units (TL, TR, BL, BR) are chamfered so every unit has a corridor frontage.
 */
export type Pt = [number, number];

export const FLOOR_WIDTH = 1400;
export const FLOOR_HEIGHT = 900;
export const METRES_PER_UNIT = 0.1;

/** Store-front line (the corridor-facing edge of perimeter units). */
export const FRONT = { top: 230, bottom: 690, left: 230, right: 1170 } as const;
/** Corridor centre-line ring, chamfered at the corners. */
export const RING = { top: 300, bottom: 620, left: 300, right: 1100, chamfer: 40 } as const;
export const ATRIUM = { x1: 500, y1: 385, x2: 900, y2: 535, radius: 60 } as const;

export const rect = (x1: number, y1: number, x2: number, y2: number): Pt[] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];

export function roundedRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  steps = 6,
): Pt[] {
  const corners: [number, number, number][] = [
    [x2 - r, y1 + r, -90],
    [x2 - r, y2 - r, 0],
    [x1 + r, y2 - r, 90],
    [x1 + r, y1 + r, 180],
  ];
  const points: Pt[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const angle = ((start + (90 * i) / steps) * Math.PI) / 180;
      points.push([
        Math.round((cx + r * Math.cos(angle)) * 10) / 10,
        Math.round((cy + r * Math.sin(angle)) * 10) / 10,
      ]);
    }
  }
  return points;
}

export const BUILDING_OUTLINE = roundedRect(40, 40, 1360, 860, 60);
export const ATRIUM_OUTLINE = roundedRect(
  ATRIUM.x1,
  ATRIUM.y1,
  ATRIUM.x2,
  ATRIUM.y2,
  ATRIUM.radius,
);

export interface Slot {
  points: Pt[];
  /** Door on the store front; the destination access node sits here. */
  door: Pt;
}

const top = (i: number): Slot => ({
  points: rect(300 + 160 * i, 60, 460 + 160 * i, FRONT.top),
  door: [380 + 160 * i, FRONT.top],
});
const bottom = (i: number): Slot => ({
  points: rect(300 + 160 * i, FRONT.bottom, 460 + 160 * i, 840),
  door: [380 + 160 * i, FRONT.bottom],
});

export const SLOTS = {
  TL: {
    points: [
      [60, 60],
      [300, 60],
      [300, 230],
      [230, 300],
      [60, 300],
    ],
    door: [265, 265],
  },
  TR: {
    points: [
      [1100, 60],
      [1340, 60],
      [1340, 300],
      [1170, 300],
      [1100, 230],
    ],
    door: [1135, 265],
  },
  BL: {
    points: [
      [60, 620],
      [230, 620],
      [300, 690],
      [300, 840],
      [60, 840],
    ],
    door: [265, 655],
  },
  BR: {
    points: [
      [1170, 620],
      [1340, 620],
      [1340, 840],
      [1100, 840],
      [1100, 690],
    ],
    door: [1135, 655],
  },
  T1: top(0),
  T2: top(1),
  T3: top(2),
  T4: top(3),
  T5: top(4),
  B1: bottom(0),
  B2: bottom(1),
  B3: bottom(2),
  B4: bottom(3),
  B5: bottom(4),
  L1: { points: rect(60, 300, FRONT.left, 460), door: [FRONT.left, 380] },
  L2: { points: rect(60, 460, FRONT.left, 620), door: [FRONT.left, 540] },
  R1: { points: rect(FRONT.right, 300, 1340, 460), door: [FRONT.right, 380] },
  R2: { points: rect(FRONT.right, 460, 1340, 620), door: [FRONT.right, 540] },
  // Ground floor keeps a west passage to parking and an east passage to taxis between L1/L2 and R1/R2.
  L1_SHORT: { points: rect(60, 300, FRONT.left, 430), door: [FRONT.left, 365] },
  L2_SHORT: { points: rect(60, 490, FRONT.left, 620), door: [FRONT.left, 555] },
  R1_SHORT: { points: rect(FRONT.right, 300, 1340, 430), door: [FRONT.right, 365] },
  R2_SHORT: { points: rect(FRONT.right, 490, 1340, 620), door: [FRONT.right, 555] },
  // Merged anchor units.
  B3_B4: { points: rect(620, FRONT.bottom, 940, 840), door: [780, FRONT.bottom] },
  CINEMA: {
    points: [
      [60, 60],
      [460, 60],
      [460, 230],
      [300, 230],
      [230, 300],
      [230, 460],
      [60, 460],
    ],
    door: [265, 265],
  },
} satisfies Record<string, { points: number[][]; door: number[] }> as unknown as Record<
  string,
  Slot
>;

export type SlotId = keyof typeof SLOTS;

/** Shared vertical circulation positions (identical on every floor). */
export const CIRCULATION = {
  escalatorWestUp: [400, 440] as Pt,
  escalatorWestDown: [400, 480] as Pt,
  escalatorEastUp: [1000, 440] as Pt,
  escalatorEastDown: [1000, 480] as Pt,
  liftCentral: [700, 572] as Pt,
  liftEast: [1225, 780] as Pt,
  stairsWest: [140, 775] as Pt,
  stairsEast: [1290, 700] as Pt,
  washroomWest: [150, 690] as Pt,
  washroomEast: [1250, 680] as Pt,
};

export function centroid(points: Pt[]): Pt {
  // Area-weighted polygon centroid (works for the non-convex cinema L-shape).
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-6) {
    const n = points.length;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (6 * area), cy / (6 * area)];
}
