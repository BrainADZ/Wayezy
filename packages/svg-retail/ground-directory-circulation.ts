import walks from '../domain/reference/ground-floor-circulation.json';
import {
  center,
  rootBox,
  rootMatrix,
  sourceGeometry,
  type Point,
  type RetailModule,
} from './ground-model';

/** Highlight only empty entrance recesses already drawn into the retail frontage. */
export function buildGroundDirectoryCirculation(
  svg: SVGSVGElement,
  modules: RetailModule[],
  sourceModules: RetailModule[],
) {
  const geometry = sourceGeometry(svg);
  const lookup = new Map(geometry.map((el) => [el.id, el]));
  const parts = modules.flatMap((module) =>
    module.sourceIds.map((id) => {
      const el = lookup.get(id)!;
      return {
        el,
        moduleId: module.id,
        box: rootBox(el, svg),
        inverse: rootMatrix(el, svg).inverse(),
      };
    }),
  );
  const ownersAt = (p: Point) =>
    new Set(
      parts
        .filter(
          ({ el, box, inverse }) =>
            p.x >= box.x &&
            p.x <= box.x + box.width &&
            p.y >= box.y &&
            p.y <= box.y + box.height &&
            el.isPointInFill(new DOMPoint(p.x, p.y).matrixTransform(inverse)),
        )
        .map((part) => part.moduleId),
    );
  const openings: { id: string; sourceId: string; points: Point[]; moduleId: string }[] = [];
  for (const el of geometry) {
    const style = getComputedStyle(el),
      d = el.getAttribute('d') ?? '';
    if (
      style.fill !== 'none' ||
      style.stroke !== 'rgb(0, 0, 0)' ||
      !/^M\s*0,0\s*[HV]/.test(d) ||
      /[a-z]/i.test(d.replace(/[MHV]/gi, '')) ||
      (d.match(/[Mm]/g) ?? []).length !== 1
    )
      continue;
    const b = rootBox(el, svg),
      short = Math.min(b.width, b.height),
      long = Math.max(b.width, b.height);
    if (short < 2 || short > 15 || long < 8 || long > 26 || ownersAt(center(b)).size) continue;
    const corners = [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ];
    const inverse = rootMatrix(el, svg).inverse();
    // Reject diagonal symbols, stair details and partial paths that merely share a box.
    if (!corners.every((p) => el.isPointInStroke(new DOMPoint(p.x, p.y).matrixTransform(inverse))))
      continue;
    const edges = [
      { x: b.x + b.width / 2, y: b.y - 0.6 },
      { x: b.x + b.width + 0.6, y: b.y + b.height / 2 },
      { x: b.x + b.width / 2, y: b.y + b.height + 0.6 },
      { x: b.x - 0.6, y: b.y + b.height / 2 },
    ].map(ownersAt);
    const mouth = edges.map((owners, i) => (owners.size === 0 ? i : -1)).filter((i) => i >= 0);
    if (mouth.length !== 1) continue;
    const adjoining = edges.filter((_, i) => i !== mouth[0]);
    const moduleId = [...adjoining[0]].find((id) => adjoining.every((owners) => owners.has(id)));
    if (
      !moduleId ||
      openings.some(
        (opening) => Math.hypot(opening.points[1].x - b.x, opening.points[1].y - b.y) < 0.1,
      )
    )
      continue;
    // Leave the public-facing edge open and trace the three existing recess edges.
    const points = Array.from({ length: 4 }, (_, i) => corners[(mouth[0] + 1 + i) % 4]);
    openings.push({
      id: `ground-opening-${openings.length + 1}`,
      sourceId: el.id,
      points,
      moduleId,
    });
  }
  const north = sourceModules.find((module) => module.id === 'module-21b')!.bounds;
  const south = sourceModules.find((module) => module.id === 'module-21a')!.bounds;
  const east = sourceModules.find((module) => module.id === 'module-21d')!.bounds;
  // The ground-level open forecourt sits between the original U-wing frontages;
  // unlike the upper floor courtyard it is a pedestrian surface, not an open void.
  const forecourt = {
    x: 427,
    y: north.y + north.height,
    width: east.x - 427,
    height: south.y - north.y - north.height,
  };
  return {
    tileSourceIds: [] as string[],
    tileSpacing: 0,
    edgeSourceIds: [] as string[],
    voids: [],
    openings,
    walkways: walks.aisles.map((points, i) => ({
      id: `ground-aisle-${i + 1}`,
      points: points.map(([x, y]) => ({ x, y })),
      width: [28, 28, 36, 26, 26, 32, 26, 24, 24, 26, 24, 24][i],
    })),
    forecourts: [{ id: 'ground-north-forecourt', bounds: forecourt }],
  };
}
