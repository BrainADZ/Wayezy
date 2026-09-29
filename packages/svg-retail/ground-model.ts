import { detectRetailModules, type Box } from './detect';
import overrides from '../domain/reference/ground-floor-overrides.json';
import bindings from '../domain/reference/ground-floor-tenants.json';

export type Point = { x: number; y: number };
export type RetailModule = {
  id: string;
  sourceIds: string[];
  bounds: Box;
  anchor: Point;
  labelBox: Box;
  tenantId?: string;
  method: string;
};
export type FloorArea = {
  id: string;
  kind: string;
  name: string;
  sourceIds: string[];
  bounds: Box;
  anchor: Point;
};
export type FloorModel = {
  source: string;
  bounds: Box;
  modules: RetailModule[];
  areas: FloorArea[];
  amenities: typeof overrides.amenities;
  warnings: string[];
};
export const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
export function rootMatrix(el: SVGGraphicsElement, svg: SVGSVGElement) {
  return svg.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!);
}
export function rootBox(el: SVGGraphicsElement, svg: SVGSVGElement): Box {
  const b = el.getBBox(),
    m = rootMatrix(el, svg);
  return union(
    [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ].map(([x, y]) => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      return { x: p.x, y: p.y, width: 0, height: 0 };
    }),
  );
}
export function sourceGeometry(svg: SVGSVGElement) {
  return [...svg.querySelectorAll<SVGGeometryElement>('path,polygon,rect')].filter(
    (el) => !el.closest('defs,clipPath,mask,[data-directory-layer]'),
  );
}
type Part = { el: SVGGeometryElement; box: Box; inverse: DOMMatrix };
function inPart(part: Part, p: Point) {
  const b = part.box;
  return (
    p.x >= b.x &&
    p.x <= b.x + b.width &&
    p.y >= b.y &&
    p.y <= b.y + b.height &&
    part.el.isPointInFill(new DOMPoint(p.x, p.y).matrixTransform(part.inverse))
  );
}

/** Largest interior label area, sampled against actual filled paths. This is never shop geometry. */
function interiorLabelBox(parts: Part[], bounds: Box): Box {
  const columns = 28,
    rows = 28,
    dx = bounds.width / columns,
    dy = bounds.height / rows;
  const heights = Array(columns).fill(0) as number[];
  let best = { area: 0, x: 0, y: 0, w: 0, h: 0 };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const full = [
        [0.08, 0.08],
        [0.92, 0.08],
        [0.08, 0.92],
        [0.92, 0.92],
        [0.5, 0.5],
      ].every(([x, y]) =>
        parts.some((part) =>
          inPart(part, { x: bounds.x + (col + x) * dx, y: bounds.y + (row + y) * dy }),
        ),
      );
      heights[col] = full ? heights[col] + 1 : 0;
    }
    for (let left = 0; left < columns; left++) {
      let h = heights[left];
      for (let right = left; right < columns && h; right++) {
        h = Math.min(h, heights[right]);
        const w = right - left + 1,
          area = w * h;
        if (area > best.area) best = { area, x: left, y: row - h + 1, w, h };
      }
    }
  }
  const inset = Math.min(3, dx, dy);
  return {
    x: bounds.x + best.x * dx + inset,
    y: bounds.y + best.y * dy + inset,
    width: Math.max(0, best.w * dx - inset * 2),
    height: Math.max(0, best.h * dy - inset * 2),
  };
}

/** Build a registry of existing source IDs; never emits or modifies architectural geometry. */
export function buildGroundFloorModel(svg: SVGSVGElement): FloorModel {
  const report = detectRetailModules(svg);
  const labels = report.modules.map((m) => ({ id: m.id, anchor: center(m.labelBox) }));
  const lookup = new Map(
    [...svg.querySelectorAll<SVGGraphicsElement>('[id]')].map((el) => [el.id, el]),
  );
  for (const amenity of overrides.amenities) {
    if (!('sourceFillId' in amenity) || !amenity.sourceFillId) continue;
    const fill = lookup.get(amenity.sourceFillId) as SVGGeometryElement | undefined;
    if (
      !fill ||
      !fill.isPointInFill(
        new DOMPoint(amenity.point[0], amenity.point[1]).matrixTransform(
          rootMatrix(fill, svg).inverse(),
        ),
      )
    )
      throw new Error(`${amenity.name} is not inside source room ${amenity.sourceFillId}`);
  }
  for (const override of overrides.labels) {
    const el = lookup.get(override.sourceTextId);
    if (!el) throw new Error(`Master SVG is missing label override ${override.sourceTextId}`);
    if (!labels.some((l) => l.id === override.id))
      labels.push({ id: override.id, anchor: center(rootBox(el, svg)) });
  }
  const areas: FloorArea[] = overrides.areas.map((area) => {
    const el = lookup.get(area.sourceTextId);
    if (!el) throw new Error(`Master SVG is missing area ${area.sourceTextId}`);
    const bounds = rootBox(el, svg);
    return { ...area, sourceIds: [area.sourceTextId], bounds, anchor: center(bounds) };
  });
  const groups = new Map<string, Part[]>();
  const warnings: string[] = [];
  const greens = sourceGeometry(svg).filter(
    (el) => getComputedStyle(el).fill === 'rgb(170, 191, 106)',
  );
  const allBounds: Box[] = [];
  for (const el of greens) {
    const box = rootBox(el, svg);
    if (box.width * box.height < 0.05) continue;
    allBounds.push(box);
    const part: Part = { el, box, inverse: rootMatrix(el, svg).inverse() };
    const contained = labels.filter((label) => inPart(part, label.anchor));
    if (contained.length > 1) {
      warnings.push(`${el.id} contains multiple labels and needs an explicit source-ID override.`);
      continue;
    }
    const point = center(box);
    // A label within a source part is primary evidence. Remaining PDF fill fragments
    // follow the nearest module or named non-retail area; all assignments stay whole paths.
    const nearest = [...labels, ...areas.filter((a) => a.kind !== 'office')].sort(
      (a, b) =>
        Math.hypot(a.anchor.x - point.x, a.anchor.y - point.y) -
        Math.hypot(b.anchor.x - point.x, b.anchor.y - point.y),
    )[0];
    const owner = contained[0] ?? nearest;
    if (!owner) continue;
    groups.set(owner.id, [...(groups.get(owner.id) ?? []), part]);
  }
  const modules: RetailModule[] = labels.map((label) => {
    const parts = groups.get(label.id) ?? [];
    if (!parts.length) throw new Error(`No source fill paths for ${label.id}`);
    const bounds = union(parts.map((p) => p.box));
    const tenant = bindings.tenants.find((t) => t.moduleIds.includes(label.id));
    return {
      ...label,
      sourceIds: parts.map((p) => p.el.id),
      bounds,
      labelBox: interiorLabelBox(parts, bounds),
      tenantId: tenant ? `ground-tenant-${tenant.id}` : undefined,
      method: overrides.labels.some((o) => o.id === label.id)
        ? 'source-label-override'
        : 'source-fill-and-label',
    };
  });
  for (const area of areas) {
    const parts = groups.get(area.id) ?? [];
    area.sourceIds.push(...parts.map((p) => p.el.id));
    if (parts.length) area.bounds = union(parts.map((p) => p.box));
  }
  // Keep structural source layers in the model for future amenity / routing work.
  for (const layer of [...svg.children].filter((el) => /^layer-MC/.test(el.id))) {
    areas.push({
      id: layer.id,
      kind: 'architecture',
      name: 'Source architectural layer',
      sourceIds: [layer.id],
      bounds: rootBox(layer as SVGGraphicsElement, svg),
      anchor: center(rootBox(layer as SVGGraphicsElement, svg)),
    });
  }
  const b = union(allBounds);
  return {
    source: '/maps/ground-floor-master.svg',
    bounds: { x: b.x - 16, y: b.y - 12, width: b.width + 32, height: b.height + 24 },
    modules: modules.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    areas,
    amenities: overrides.amenities,
    warnings,
  };
}
