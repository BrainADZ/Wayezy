/** User-identified gate structures; points are master SVG root coordinates.
 * Gate centres are visually traced, not surveyed. Entry 1 is the temporary kiosk origin.
 */
export const groundFloorSource = {
  image: '/maps/ground-floor-master.svg',
  width: 914.89046,
  height: 1455.8265,
  orientation: 'portrait',
  floorId: 'l0',
  shortName: 'G',
  kiosk: { entranceId: 'ground-entry-starbucks', point: [97.59, 493.49], temporary: true },
  entrances: [
    {
      id: 'ground-entry-starbucks',
      name: 'Entry 1 — Starbucks side',
      landmark: 'Starbucks',
      side: 'left',
      approximatePoint: [97.59, 493.49],
      source: 'User instruction',
      doorPositionVerified: false,
    },
    {
      id: 'ground-entry-masaba',
      name: 'Entry 2 — Masaba side',
      landmark: 'Masaba',
      side: 'left',
      approximatePoint: [98.93, 980.16],
      source: 'User instruction',
      doorPositionVerified: false,
    },
  ],
} as const;
