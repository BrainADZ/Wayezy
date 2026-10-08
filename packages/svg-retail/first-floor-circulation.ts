import {
  center,
  rootBox,
  rootMatrix,
  sourceGeometry,
  type Point,
  type RetailModule,
} from './ground-model';

/** Read the straight architectural perimeter segments in their original order. */
function perimeterSegments(el: SVGGeometryElement, svg: SVGSVGElement) {
  const tokens =
    (el.getAttribute('d') ?? '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const matrix = rootMatrix(el, svg);
  let i = 0,
    command = '',
    point = { x: 0, y: 0 };
  const segments: { from: Point; to: Point }[] = [];
  const transform = (p: Point) => {
    const result = new DOMPoint(p.x, p.y).matrixTransform(matrix);
    return { x: result.x, y: result.y };
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++];
    const type = command.toUpperCase(),
      relative = command !== type;
    if (!['M', 'L', 'H', 'V'].includes(type))
      throw new Error(`Unsupported corridor segment in ${el.id}.`);
    const next = { ...point },
      first = Number(tokens[i++]);
    if (type === 'M' || type === 'L') {
      next.x = first + (relative ? point.x : 0);
      next.y = Number(tokens[i++]) + (relative ? point.y : 0);
    } else if (type === 'H') next.x = first + (relative ? point.x : 0);
    else next.y = first + (relative ? point.y : 0);
    if (type !== 'M') segments.push({ from: transform(point), to: transform(next) });
    point = next;
    if (type === 'M') command = relative ? 'l' : 'L';
  }
  return segments;
}

/** The tiled strokes already cover the real corridors and bridges, including their cut-outs. */
export function buildFirstFloorCirculation(svg: SVGSVGElement, modules: RetailModule[]) {
  const lookup = new Map(
    [...svg.querySelectorAll<SVGGeometryElement>('[id]')].map((el) => [el.id, el]),
  );
  const edges = ['path12', 'path11441', 'path11442', 'path7517', 'path12750', 'path12752'];
  const voids = [
    { id: 'first-north-courtyard', kind: 'courtyard', sourceId: 'path11438' },
    { id: 'first-west-courtyard', kind: 'courtyard', sourceId: 'path11439' },
    { id: 'first-east-courtyard', kind: 'courtyard', sourceId: 'path11430' },
    { id: 'first-north-atrium', kind: 'atrium', sourceId: 'path11432' },
    { id: 'first-south-atrium', kind: 'atrium', sourceId: 'path11436' },
  ].map((area) => {
    const el = lookup.get(area.sourceId);
    if (!el) throw new Error(`Missing First Floor void ${area.sourceId}.`);
    const bounds = rootBox(el, svg);
    return {
      ...area,
      name: area.kind === 'courtyard' ? 'Courtyard' : 'Open to below',
      sourceIds: [area.sourceId],
      bounds,
      anchor: center(bounds),
    };
  });
  const tiles = sourceGeometry(svg).filter((el) => {
    const id = Number(el.id.replace('path', ''));
    if (
      el.parentElement?.id !== 'layer-MC0' ||
      !((id >= 7496 && id <= 7516) || (id >= 11443 && id <= 12670))
    )
      return false;
    const style = getComputedStyle(el),
      d = el.getAttribute('d') ?? '';
    return (
      style.fill === 'none' &&
      style.stroke === 'rgb(146, 146, 146)' &&
      /^M\s*0,0\s*[HV]\s*-?\d+\s*$/.test(d)
    );
  });
  if (tiles.length < 100) throw new Error('First Floor source walkway tiles are missing.');
  const openings: { id: string; sourceId: string; points: Point[]; moduleId: string }[] = [];
  for (const id of edges.slice(0, 3)) {
    const source = lookup.get(id);
    if (!source) throw new Error(`Missing First Floor corridor edge ${id}.`);
    const segments = perimeterSegments(source, svg);
    for (let i = 1; i < segments.length - 1; i++) {
      const before = segments[i - 1],
        current = segments[i],
        after = segments[i + 1];
      const a = { x: before.to.x - before.from.x, y: before.to.y - before.from.y };
      const b = { x: current.to.x - current.from.x, y: current.to.y - current.from.y };
      const c = { x: after.to.x - after.from.x, y: after.to.y - after.from.y };
      const length = Math.hypot(b.x, b.y),
        depth = Math.hypot(a.x, a.y);
      // Opposing short returns around a recessed opening; excludes columns and straight walls.
      if (
        length < 8 ||
        length > 26 ||
        depth < 1.5 ||
        depth > 2.5 ||
        Math.abs(a.x + c.x) > 0.05 ||
        Math.abs(a.y + c.y) > 0.05 ||
        Math.abs(a.x * b.x + a.y * b.y) > 0.05
      )
        continue;
      const p = { x: (current.from.x + current.to.x) / 2, y: (current.from.y + current.to.y) / 2 };
      const distance = (module: RetailModule) => {
        const r = module.bounds;
        return Math.hypot(
          Math.max(r.x - p.x, 0, p.x - r.x - r.width),
          Math.max(r.y - p.y, 0, p.y - r.y - r.height),
        );
      };
      const module = [...modules].sort((a, b) => distance(a) - distance(b))[0];
      if (!module || distance(module) > 5) continue;
      openings.push({
        id: `first-opening-${openings.length + 1}`,
        sourceId: id,
        points: [before.from, current.from, current.to, after.to],
        moduleId: module.id,
      });
    }
  }
  return {
    tileSourceIds: tiles.map((el) => el.id),
    tileSpacing: 5.76,
    edgeSourceIds: edges,
    voids,
    openings,
  };
}
