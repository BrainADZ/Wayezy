type P = [number, number];
type Segment = { a: P; b: P; points: P[] };

const round = (v: number) => Math.round(v * 100) / 100;
const key = (p: P) => `${round(p[0])},${round(p[1])}`;
const along = (s: Segment, p: P) =>
  Math.abs(s.b[0] - s.a[0]) >= Math.abs(s.b[1] - s.a[1])
    ? (p[0] - s.a[0]) / (s.b[0] - s.a[0])
    : (p[1] - s.a[1]) / (s.b[1] - s.a[1]);

/** Closest point on a segment, clamped to its ends. */
function project(s: Segment, p: P): P {
  const dx = s.b[0] - s.a[0],
    dy = s.b[1] - s.a[1],
    t = Math.max(
      0,
      Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / (dx * dx + dy * dy)),
    );
  return [round(s.a[0] + dx * t), round(s.a[1] + dy * t)];
}

function intersection(s: Segment, t: Segment): P | null {
  const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]],
    q = [t.b[0] - t.a[0], t.b[1] - t.a[1]],
    cross = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(cross) < 1e-9) return null;
  const u = ((t.a[0] - s.a[0]) * q[1] - (t.a[1] - s.a[1]) * q[0]) / cross,
    v = ((t.a[0] - s.a[0]) * r[1] - (t.a[1] - s.a[1]) * r[0]) / cross;
  if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) return null;
  return [round(s.a[0] + r[0] * u), round(s.a[1] + r[1] * u)];
}

/**
 * Walking graph from surveyed centre-lines: aisles are split wherever they cross, and each
 * storefront gets one short approach to its nearest aisle. Pure data, no DOM required.
 */
export function buildWalkGraph(
  aisles: number[][][],
  frontages: Record<string, number[]>,
  ids: { destination: (id: string) => string; walk: string },
) {
  const segments: Segment[] = aisles.flatMap((line) =>
    line.slice(1).map((end, i) => {
      const a = line[i] as P,
        b = end as P;
      return { a, b, points: [a, b] };
    }),
  );
  for (const [i, s] of segments.entries())
    for (const t of segments.slice(i + 1)) {
      const p = intersection(s, t);
      if (!p) continue;
      s.points.push(p);
      t.points.push(p);
    }
  const links: { a: P; b: P }[] = [],
    destinations = new Map<string, string>();
  for (const [id, point] of Object.entries(frontages)) {
    const p = point as P;
    const nearest = segments
      .map((s) => ({ s, q: project(s, p) }))
      .sort(
        (x, y) =>
          Math.hypot(x.q[0] - p[0], x.q[1] - p[1]) - Math.hypot(y.q[0] - p[0], y.q[1] - p[1]),
      )[0];
    nearest.s.points.push(nearest.q);
    if (key(nearest.q) !== key(p)) links.push({ a: p, b: nearest.q });
    destinations.set(key(p), ids.destination(id));
  }
  for (const s of segments) {
    const points = [...new Map(s.points.map((p) => [key(p), p])).values()].sort(
      (x, y) => along(s, x) - along(s, y),
    );
    for (let i = 1; i < points.length; i++) links.push({ a: points[i - 1], b: points[i] });
  }
  const unique = [...new Map(links.flatMap((l) => [l.a, l.b]).map((p) => [key(p), p])).values()];
  const nodes = unique.map((p, i) => ({
    id: destinations.get(key(p)) ?? `${ids.walk}${i}`,
    x: round(p[0]),
    y: round(p[1]),
  }));
  const byKey = new Map(nodes.map((n) => [key([n.x, n.y]), n.id]));
  const seen = new Set<string>();
  const edges = links.flatMap((l) => {
    const from = byKey.get(key(l.a))!,
      to = byKey.get(key(l.b))!,
      pair = [from, to].sort().join('|');
    if (from === to || seen.has(pair)) return [];
    seen.add(pair);
    return [{ from, to }];
  });
  return { nodes, edges };
}
