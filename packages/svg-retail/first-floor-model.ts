import { detectRetailModules } from './detect';
import {
  center,
  rootBox,
  rootMatrix,
  sourceGeometry,
  union,
  interiorLabelBox,
  type FloorModel,
} from './ground-model';
import bindings from '../domain/reference/first-floor-tenants.json';
import overrides from '../domain/reference/first-floor-overrides.json';
import { buildFirstFloorCirculation } from './first-floor-circulation';

/** Module boundaries remain the original filled paths; only their metadata is compiled. */
export function buildFirstFloorModel(svg: SVGSVGElement) {
  const report = detectRetailModules(svg);
  const lookup = new Map(
    [...svg.querySelectorAll<SVGGraphicsElement>('[id]')].map((el) => [el.id, el]),
  );
  const fixes = [
    { id: 'module-3a1', textId: 'tspan11408', original: 'module-3' },
    { id: 'module-3a2', textId: 'tspan12749', original: 'module-3' },
    { id: 'module-17b1', textId: 'tspan12741', original: 'module-17' },
    { id: 'module-17b2', textId: 'tspan11422', original: 'module-17' },
    { id: 'module-17', textId: 'tspan12676', original: 'module-17' },
  ].map((fix) => ({ ...fix, point: center(rootBox(lookup.get(fix.textId)!, svg)) }));
  const labels = report.modules.map((module) => {
    const anchor = center(module.labelBox);
    const candidates = fixes.filter((fix) => fix.original === module.id);
    const fix = candidates.sort(
      (a, b) =>
        Math.hypot(anchor.x - a.point.x, anchor.y - a.point.y) -
        Math.hypot(anchor.x - b.point.x, anchor.y - b.point.y),
    )[0];
    return { id: fix?.id ?? module.id, anchor };
  });
  for (const override of overrides.modules) {
    if (!('sourceTextId' in override) || !override.sourceTextId) continue;
    const source = lookup.get(override.sourceTextId);
    if (!source) throw new Error(`Missing First Floor module label ${override.sourceTextId}.`);
    labels.push({ id: override.id, anchor: center(rootBox(source, svg)) });
  }
  if (new Set(labels.map((label) => label.id)).size !== labels.length)
    throw new Error('First Floor module IDs are not unique.');
  const parts = sourceGeometry(svg)
    .filter((el) => getComputedStyle(el).fill === 'rgb(170, 191, 106)')
    .map((el) => ({ el, box: rootBox(el, svg), inverse: rootMatrix(el, svg).inverse() }))
    .filter((part) => part.box.width * part.box.height > 0.05);
  const inPart = (part: (typeof parts)[number], point: { x: number; y: number }) =>
    point.x >= part.box.x &&
    point.x <= part.box.x + part.box.width &&
    point.y >= part.box.y &&
    point.y <= part.box.y + part.box.height &&
    part.el.isPointInFill(new DOMPoint(point.x, point.y).matrixTransform(part.inverse));
  const groups = new Map<string, typeof parts>();
  const confirmedOwners = new Map<string, string>();
  for (const override of overrides.modules) {
    for (const id of override.sourceIds) {
      if (confirmedOwners.has(id)) throw new Error(`Duplicate First Floor source override ${id}.`);
      if (!parts.some((part) => part.el.id === id))
        throw new Error(`Missing First Floor fill override ${id}.`);
      confirmedOwners.set(id, override.id);
    }
  }
  for (const part of parts) {
    const confirmedOwner = confirmedOwners.get(part.el.id);
    if (confirmedOwner) {
      groups.set(confirmedOwner, [...(groups.get(confirmedOwner) ?? []), part]);
      continue;
    }
    const inside = labels.filter((label) => inPart(part, label.anchor));
    if (inside.length > 1)
      throw new Error(`First Floor fill ${part.el.id} contains multiple modules.`);
    const point = center(part.box);
    const owner =
      inside[0] ??
      [...labels].sort(
        (a, b) =>
          Math.hypot(a.anchor.x - point.x, a.anchor.y - point.y) -
          Math.hypot(b.anchor.x - point.x, b.anchor.y - point.y),
      )[0];
    groups.set(owner.id, [...(groups.get(owner.id) ?? []), part]);
  }
  const modules = labels.map((label) => {
    const group = groups.get(label.id);
    if (!group?.length) throw new Error(`Missing First Floor source geometry for ${label.id}.`);
    const bounds = union(group.map((part) => part.box));
    return {
      ...label,
      sourceIds: group.map((part) => part.el.id),
      bounds,
      labelBox: interiorLabelBox(group, bounds),
      method: overrides.modules.some((override) => override.id === label.id)
        ? 'confirmed-source-boundary'
        : 'source-fill-and-label',
      tenantId: undefined as string | undefined,
    };
  });
  const tenants = bindings.tenants.map((tenant) => {
    const moduleIds = tenant.sourceTextIds.map((textId) => {
      const label = lookup.get(textId);
      if (!label) throw new Error(`Missing First Floor brand label ${textId}.`);
      const point = center(rootBox(label, svg));
      const contained = modules.filter((module) =>
        groups.get(module.id)!.some((part) => inPart(part, point)),
      );
      const module =
        contained[0] ??
        [...modules].sort(
          (a, b) =>
            Math.hypot(center(a.labelBox).x - point.x, center(a.labelBox).y - point.y) -
            Math.hypot(center(b.labelBox).x - point.x, center(b.labelBox).y - point.y),
        )[0];
      if (module.tenantId && module.tenantId !== `first-tenant-${tenant.id}`)
        throw new Error(
          `Conflicting First Floor brands in ${module.id}: ${module.tenantId} / ${tenant.id}`,
        );
      module.tenantId = `first-tenant-${tenant.id}`;
      return module.id;
    });
    for (const id of tenant.moduleIds ?? []) {
      const module = modules.find((module) => module.id === id);
      if (!module) throw new Error(`Missing confirmed First Floor module ${id}.`);
      if (module.tenantId && module.tenantId !== `first-tenant-${tenant.id}`)
        throw new Error(`Confirmed First Floor occupancy conflicts in ${id}.`);
      module.tenantId = `first-tenant-${tenant.id}`;
      moduleIds.push(id);
    }
    return { ...tenant, moduleIds: [...new Set(moduleIds)] };
  });
  // User-confirmed adjoining units share one brand label and selection footprint.
  // Their original source paths and architectural module IDs remain intact.
  const combinedIds = new Set(
    bindings.tenants.flatMap((tenant) =>
      (tenant.moduleIds?.length ?? 0) > 1 ? tenant.moduleIds! : [],
    ),
  );
  const displayModules = [
    ...modules.filter((module) => !combinedIds.has(module.id)),
    ...bindings.tenants
      .filter((tenant) => (tenant.moduleIds?.length ?? 0) > 1)
      .map((tenant) => {
        const memberModules = modules.filter((module) => tenant.moduleIds!.includes(module.id));
        const memberParts = memberModules.flatMap((module) => groups.get(module.id)!);
        const bounds = union(memberParts.map((part) => part.box));
        const labelBox = interiorLabelBox(memberParts, bounds);
        const primary = memberModules.find((module) => module.id === tenant.moduleIds!.at(-1))!;
        return {
          ...primary,
          sourceIds: memberParts.map((part) => part.el.id),
          bounds,
          labelBox,
          anchor: center(labelBox),
          method: 'confirmed-combined-occupancy',
        };
      }),
  ];
  const box = union(parts.map((part) => part.box));
  const doorParts = sourceGeometry(svg)
    .filter((el) => getComputedStyle(el).fill === 'none')
    .map((el) => ({ id: el.id, box: rootBox(el, svg) }));
  const circulation = buildFirstFloorCirculation(svg, displayModules);
  const model: FloorModel = {
    source: '/maps/First%20Floor%20Plan-%20Grand%20View%20High%20Street.svg',
    bounds: { x: box.x - 16, y: box.y - 12, width: box.width + 32, height: box.height + 24 },
    modules,
    displayModules,
    circulation,
    doors: overrides.doors.map((door) => {
      const b = door.symbolBounds;
      const sourceIds = doorParts
        .filter(
          ({ box }) =>
            (box.width > 0 || box.height > 0) &&
            box.x >= b.x &&
            box.y >= b.y &&
            box.x + box.width <= b.x + b.width &&
            box.y + box.height <= b.y + b.height,
        )
        .map(({ id }) => id);
      if (!sourceIds.length) throw new Error(`Missing First Floor entrance ${door.id}.`);
      return { id: door.id, name: door.name, sourceIds, labelPoint: door.labelPoint };
    }),
    areas: [
      {
        id: 'first-office',
        kind: 'office',
        name: 'Offices',
        sourceIds: ['text12314'],
        bounds: rootBox(lookup.get('text12314')!, svg),
        anchor: center(rootBox(lookup.get('text12314')!, svg)),
      },
      ...circulation.voids,
    ],
    amenities: overrides.amenities,
    warnings: [],
  };
  return { model, tenants };
}
