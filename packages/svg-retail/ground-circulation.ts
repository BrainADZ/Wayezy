import source from '../domain/reference/ground-floor-circulation.json';
import { rootBox, rootMatrix, sourceGeometry } from './ground-model';
type P = number[];
const key = (p: P) => `${p[0]},${p[1]}`;

/** Build-time validation only: keep walks outside source retail fills and wall strokes. */
export function prepareCirculation(svg: SVGSVGElement) {
  const obstacles = sourceGeometry(svg)
    .filter((el) => ['retail', 'core', 'line'].includes(el.getAttribute('data-map-paint') ?? ''))
    .map((el) => ({
      el,
      b: rootBox(el, svg),
      inverse: rootMatrix(el, svg).inverse(),
      stroke: el.getAttribute('data-map-paint') === 'line',
    }));
  function clear(a: P, b: P) {
    const candidates = obstacles.filter(
      (o) =>
        o.b.x <= Math.max(a[0], b[0]) + 1 &&
        o.b.x + o.b.width >= Math.min(a[0], b[0]) - 1 &&
        o.b.y <= Math.max(a[1], b[1]) + 1 &&
        o.b.y + o.b.height >= Math.min(a[1], b[1]) - 1,
    );
    const count = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) * 2);
    for (let i = 0; i <= count; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / count,
        y = a[1] + ((b[1] - a[1]) * i) / count;
      if (
        candidates.some(
          (o) =>
            x >= o.b.x - 0.3 &&
            x <= o.b.x + o.b.width + 0.3 &&
            y >= o.b.y - 0.3 &&
            y <= o.b.y + o.b.height + 0.3 &&
            (o.stroke
              ? o.el.isPointInStroke(new DOMPoint(x, y).matrixTransform(o.inverse))
              : o.el.isPointInFill(new DOMPoint(x, y).matrixTransform(o.inverse))),
        )
      )
        return false;
    }
    return true;
  }
  const segments = source.aisles.flatMap((line) =>
    line.slice(1).map((end, i) => ({ a: line[i], b: end, points: [line[i], end] })),
  );
  const on = (p: P, s: (typeof segments)[number]) =>
    Math.abs((s.b[0] - s.a[0]) * (p[1] - s.a[1]) - (s.b[1] - s.a[1]) * (p[0] - s.a[0])) < 0.01 &&
    p[0] >= Math.min(s.a[0], s.b[0]) &&
    p[0] <= Math.max(s.a[0], s.b[0]) &&
    p[1] >= Math.min(s.a[1], s.b[1]) &&
    p[1] <= Math.max(s.a[1], s.b[1]);
  for (const s of segments)
    for (const t of segments) {
      const p = s.a[0] === s.b[0] ? [s.a[0], t.a[1]] : [t.a[0], s.a[1]];
      if (on(p, s) && on(p, t)) {
        s.points.push(p);
        t.points.push(p);
      }
    }
  const links: { a: P; b: P }[] = [],
    destinations: { id: string; point: P }[] = [],
    warnings: string[] = [];
  for (const [id, p] of Object.entries(source.frontages)) {
    const candidates = segments
      .map((s) => ({
        s,
        q:
          s.a[0] === s.b[0]
            ? [s.a[0], Math.max(Math.min(p[1], Math.max(s.a[1], s.b[1])), Math.min(s.a[1], s.b[1]))]
            : [
                Math.max(Math.min(p[0], Math.max(s.a[0], s.b[0])), Math.min(s.a[0], s.b[0])),
                s.a[1],
              ],
      }))
      .sort(
        (a, b) =>
          Math.hypot(a.q[0] - p[0], a.q[1] - p[1]) - Math.hypot(b.q[0] - p[0], b.q[1] - p[1]),
      );
    const candidate = candidates.find(
      (c) => Math.hypot(c.q[0] - p[0], c.q[1] - p[1]) < 180 && clear(p, c.q),
    );
    if (!candidate) {
      warnings.push(`No clear source approach to ${id}`);
      continue;
    }
    candidate.s.points.push(candidate.q);
    links.push({ a: p, b: candidate.q });
    destinations.push({ id: `ground-tenant-${id}`, point: p });
  }
  for (const segment of segments) {
    const pts = [...new Map(segment.points.map((p) => [key(p), p])).values()].sort(
      (a, b) => a[0] - b[0] || a[1] - b[1],
    );
    for (let i = 1; i < pts.length; i++)
      if (clear(pts[i - 1], pts[i])) links.push({ a: pts[i - 1], b: pts[i] });
      else warnings.push(`Source obstruction: ${key(pts[i - 1])} to ${key(pts[i])}`);
  }
  // Entry gate is a symbolic gate drawing, not a retail footprint or wall. Its short
  // approach exits into the open forecourt north of Starbucks.
  const entry = [97.59, 493.49];
  links.push({ a: entry, b: [195, 493.49] });
  destinations.push({ id: 'ground-entry-starbucks', point: entry });
  const nodes = [...new Map(links.flatMap((e) => [e.a, e.b]).map((p) => [key(p), p])).values()].map(
    (p, i) => ({
      id: destinations.find((d) => key(d.point) === key(p))?.id ?? `ground-walk-${i}`,
      x: p[0],
      y: p[1],
    }),
  );
  const byPoint = new Map(nodes.map((n) => [`${n.x},${n.y}`, n.id]));
  const edges = links
    .filter((l) => key(l.a) !== key(l.b))
    .map((l) => ({ from: byPoint.get(key(l.a))!, to: byPoint.get(key(l.b))! }));
  return { nodes, edges, warnings, unresolved: source.unresolved };
}
