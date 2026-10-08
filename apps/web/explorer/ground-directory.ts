import type { MapPlace } from './explorer-model';
import {
  center,
  rootBox,
  rootMatrix,
  sourceGeometry,
  type FloorModel,
} from '../../../packages/svg-retail/ground-model';
import bindings from '../../../packages/domain/reference/ground-floor-tenants.json';
import overrides from '../../../packages/domain/reference/ground-floor-overrides.json';
import liftIcon from '@material-design-icons/svg/outlined/elevator.svg?raw';
import stairsIcon from '@material-design-icons/svg/outlined/stairs.svg?raw';
import escalatorIcon from '@material-design-icons/svg/outlined/escalator.svg?raw';
import maleWashroomIcon from '@material-design-icons/svg/outlined/man.svg?raw';
import femaleWashroomIcon from '@material-design-icons/svg/outlined/woman.svg?raw';
import { addEnvironment, addDirectoryDefinitions } from './ground-environment';
import { addFirstFloorEnvironment } from './first-floor-environment';
import { GATE_ICON_PATH, HERE_PIN_PATH } from './ground-symbols';

const NS = 'http://www.w3.org/2000/svg';
function element<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
function text(parent: Element, value: string, attrs: Record<string, string | number>) {
  const el = element('text', attrs);
  el.textContent = value;
  parent.append(el);
  return el;
}

/** Restyle source vectors and add clipped content. No retail geometry is generated. */
export type DirectoryOptions = {
  tenants: {
    id: string;
    moduleIds: string[];
    category: string;
    shortName?: string;
    logo?: string;
  }[];
  spaces: { id: string; kind: string; name: string; sourceTextId: string }[];
  groundEnvironment?: boolean;
  balancedLabels?: boolean;
};

export function presentGroundDirectory(
  svg: SVGSVGElement,
  model: FloorModel,
  places: MapPlace[],
  options: DirectoryOptions = {
    tenants: bindings.tenants,
    spaces: overrides.spaces,
    groundEnvironment: true,
  },
) {
  svg.querySelectorAll('[data-directory-layer]').forEach((el) => el.remove());
  svg.setAttribute('data-directory-plan', '');
  const ids = new Map(
    [...svg.querySelectorAll<SVGGraphicsElement>('[id]')].map((el) => [el.id, el]),
  );
  // Batch layout reads before writes: this architectural export has over 31,000 paths.
  const matrices = new Map(
    model.modules
      .flatMap((module) => module.sourceIds)
      .map((id) => {
        const part = ids.get(id)!;
        return [
          id,
          { matrix: rootMatrix(part, svg), fillRule: getComputedStyle(part).fillRule },
        ] as const;
      }),
  );
  const spaces = options.spaces.map((space) => {
    const source = ids.get(space.sourceTextId);
    if (!source) throw new Error(`Missing architectural space label ${space.sourceTextId}`);
    return { ...space, anchor: center(rootBox(source, svg)) };
  });
  const paints = sourceGeometry(svg)
    .filter((el) => !el.hasAttribute('data-map-paint'))
    .map((el) => {
      const style = getComputedStyle(el);
      const red = [style.fill, style.stroke].some((c) => {
        const m = c.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
        return (
          m &&
          Number(m[1]) > 120 &&
          Number(m[1]) > Number(m[2]) + 40 &&
          Number(m[1]) > Number(m[3]) + 40
        );
      });
      const d = el.getAttribute('d') ?? '';
      const curvedDoor =
        style.fill === 'none' &&
        style.stroke === 'rgb(0, 0, 0)' &&
        /^M\s*0,0\s*C/.test(d) &&
        (() => {
          const b = rootBox(el, svg);
          return b.width >= 5 && b.width <= 20 && b.height >= 5 && b.height <= 20;
        })();
      return {
        el,
        paint:
          style.fill === 'rgb(250, 205, 128)'
            ? 'core'
            : red
              ? 'annotation'
              : style.fill === 'rgb(170, 191, 106)'
                ? 'retail'
                : curvedDoor
                  ? 'door'
                  : style.fill === 'none'
                    ? 'line'
                    : 'structure',
      };
    });
  for (const { el, paint } of paints) el.setAttribute('data-map-paint', paint);
  for (const door of model.doors ?? []) {
    for (const id of door.sourceIds) {
      const source = ids.get(id);
      if (!source) throw new Error(`Missing architectural door path ${id}`);
      source.setAttribute('data-map-paint', 'door');
      source.setAttribute('data-directory-door', door.id);
    }
  }
  // Hide only the old escalator symbol strokes covered by the replacement icon.
  // Keep the original vectors, surrounding walls and corridor outlines intact.
  const escalatorBoxes = model.amenities
    .filter((a) => a.kind === 'escalator' && 'symbolBounds' in a)
    .map(
      (a) =>
        (a as typeof a & { symbolBounds: { x: number; y: number; width: number; height: number } })
          .symbolBounds,
    );
  for (const source of sourceGeometry(svg)) {
    if (!['line', 'structure'].includes(source.getAttribute('data-map-paint') ?? '')) continue;
    const b = rootBox(source, svg);
    if (
      escalatorBoxes.some(
        (box) =>
          b.x >= box.x - 0.1 &&
          b.y >= box.y - 0.1 &&
          b.x + b.width <= box.x + box.width + 0.1 &&
          b.y + b.height <= box.y + box.height + 0.1,
      )
    )
      source.setAttribute('data-replaced-amenity-symbol', 'escalator');
  }
  svg.querySelectorAll('text').forEach((el) => el.setAttribute('data-source-label', ''));
  ids.get('1 - Annotations')?.setAttribute('data-source-annotations', '');
  const layer = element('g', { 'data-directory-layer': '', class: 'directory-content' });
  const defs = element('defs');
  layer.append(defs);
  svg.append(layer);
  const underlay = element('g', { 'data-directory-layer': '', 'pointer-events': 'none' });
  svg.insertBefore(underlay, svg.firstChild);
  if (options.groundEnvironment) addEnvironment(svg, defs, underlay, layer, model);
  else {
    addDirectoryDefinitions(defs);
    if (model.circulation) addFirstFloorEnvironment(svg, model, defs, underlay, layer);
  }
  const labelMeasures: { nodes: SVGTextElement[]; width: number; fontSize: number }[] = [];

  for (const module of model.displayModules ?? model.modules) {
    const place = places.find((p) => p.id === module.tenantId);
    const binding = options.tenants.find((t) => t.moduleIds.includes(module.id));
    const parts = module.sourceIds
      .map((id) => ids.get(id))
      .filter((el): el is SVGGraphicsElement => !!el);
    const clipId = `directory-clip-${module.id}`;
    const clip = element('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    for (const [i, part] of parts.entries()) {
      part.setAttribute('data-module-id', module.id);
      part.setAttribute('data-place-id', module.tenantId ?? '');
      part.setAttribute('data-category', binding?.category ?? 'unoccupied');
      part.setAttribute('data-map-paint', 'retail');
      if (place) {
        const title = element('title');
        title.textContent = place.name;
        part.append(title);
      }
      if (i === 0) {
        part.setAttribute('tabindex', place ? '0' : '-1');
        part.setAttribute('role', place ? 'button' : 'img');
        part.setAttribute(
          'aria-label',
          `${place?.name ?? 'Retail'} · ${module.id.replace('module-', 'Unit ').toUpperCase()}`,
        );
      }
      const copy = part.cloneNode(false) as SVGGraphicsElement;
      for (const attr of [...copy.attributes])
        if (
          !['d', 'points', 'x', 'y', 'width', 'height', 'rx', 'ry', 'fill-rule'].includes(attr.name)
        )
          copy.removeAttribute(attr.name);
      const { matrix: m, fillRule } = matrices.get(part.id)!;
      copy.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      copy.setAttribute('fill', 'black');
      copy.setAttribute('stroke', 'none');
      copy.setAttribute('fill-rule', fillRule);
      clip.append(copy);
    }
    defs.append(clip);
    let brandClipId = clipId;
    if (module.method === 'connected-tenant-occupancy') {
      // Typography can span a same-outlet bay divider without changing its source
      // retail geometry, shadows or interaction footprint.
      brandClipId = `directory-label-clip-${module.id}`;
      const labelClip = element('clipPath', { id: brandClipId, clipPathUnits: 'userSpaceOnUse' });
      labelClip.append(element('rect', module.labelBox));
      defs.append(labelClip);
    }
    const shadow = element('g', {
      class: 'directory-module-depth',
      'data-place-id': module.tenantId ?? '',
      'data-brand-module': module.id,
      'aria-hidden': 'true',
    });
    for (const child of [...clip.children]) shadow.append(child.cloneNode(true));
    underlay.append(shadow);
    const brand = element('g', {
      class: 'directory-brand',
      'data-brand-module': module.id,
      'data-place-id': module.tenantId ?? '',
      'clip-path': `url(#${brandClipId})`,
      'pointer-events': 'none',
    });
    layer.append(brand);
    const b = module.labelBox,
      p = center(b);
    if (b.width < 3 || b.height < 3) continue;
    // The whole architecture is presented in landscape; counter-rotate content
    // around its original source anchor so logos and words still read upright.
    const width = b.height,
      height = b.width;
    const content = element('g', { transform: `translate(${p.x} ${p.y}) rotate(90)` });
    brand.append(content);
    const name = binding?.shortName ?? place?.name ?? 'TO LET';
    const logo = binding?.logo || place?.tenant?.logo;
    const showLogo = !!logo && logo.startsWith('/brand/logo/') && !logo.startsWith('//');
    if (showLogo) {
      content.append(
        element('image', {
          href: logo,
          x: -width * 0.44,
          y: -height * 0.43,
          width: width * 0.88,
          height: height * 0.86,
          preserveAspectRatio: 'xMidYMid meet',
          'data-local-brand-logo': binding?.id ?? '',
        }),
      );
      continue;
    }
    const lines: string[] = [];
    const words = name.split(' ');
    const wrap =
      (!place && height > width * 1.4) ||
      (name.length > 7 && height > 42 && width < name.length * 10);
    if (wrap) {
      let first = '';
      while (words.length && (first.length < name.length / 2 || !first)) {
        const next = `${first ? `${first} ` : ''}${words[0]}`;
        if (
          options.balancedLabels &&
          first &&
          Math.abs(next.length - name.length / 2) > Math.abs(first.length - name.length / 2)
        )
          break;
        first += `${first ? ' ' : ''}${words.shift()}`;
      }
      lines.push(first);
      if (words.length) lines.push(words.join(' '));
    } else lines.push(name);
    const fontSize = Math.min(
      place ? 19 : 15,
      (height * 0.64) / lines.length,
      width / (Math.max(1, ...lines.map((l) => l.length)) * 0.54),
    );
    const nodes = lines.map((line, i) =>
      text(content, line, {
        x: 0,
        y: (i - (lines.length - 1) / 2) * fontSize * 1.1,
        'font-size': fontSize,
        'dominant-baseline': 'central',
        'text-anchor': 'middle',
        class: place ? 'directory-store-name' : 'directory-unit-name',
        'data-brand': binding?.id ?? '',
      }),
    );
    labelMeasures.push({ nodes, width, fontSize });
  }
  const sizes = labelMeasures.map(({ nodes, width, fontSize }) => ({
    nodes,
    fontSize:
      fontSize *
      Math.min(1, (width * 0.93) / Math.max(...nodes.map((node) => node.getComputedTextLength()))),
  }));
  for (const { nodes, fontSize } of sizes)
    nodes.forEach((node) => node.setAttribute('font-size', String(fontSize)));
  for (const door of model.doors ?? []) {
    const [x, y] = door.labelPoint;
    const label = element('g', {
      class: 'directory-door-label',
      'data-door-label': door.id,
      'aria-label': door.name,
      'pointer-events': 'none',
      transform: `translate(${x} ${y}) rotate(90)`,
    });
    text(label, 'ENTRY', {
      x: 0,
      y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 9,
    });
    layer.append(label);
  }
  for (const area of model.areas.filter((a) =>
    ['office', 'special-store', 'courtyard', 'atrium'].includes(a.kind),
  )) {
    const g = element('g', {
      class: `directory-area-label is-${area.kind}`,
      'data-area-id': area.id,
      'pointer-events': 'none',
      transform: `rotate(90 ${area.anchor.x} ${area.anchor.y})`,
    });
    layer.append(g);
    text(g, area.name, {
      x: area.anchor.x,
      y: area.anchor.y,
      'text-anchor': 'middle',
      'font-size':
        area.kind === 'office' ? 24 : area.kind === 'courtyard' && model.circulation ? 13 : 10,
    });
    if (area.kind === 'office')
      text(g, 'OFFICE WING', {
        x: area.anchor.x,
        y: area.anchor.y + 19,
        'text-anchor': 'middle',
        'font-size': 8,
        'letter-spacing': 2,
      });
    if (area.kind === 'courtyard' && model.circulation)
      text(g, 'OPEN TO BELOW', {
        x: area.anchor.x,
        y: area.anchor.y + 15,
        'text-anchor': 'middle',
        'font-size': 7.5,
        'letter-spacing': 0.8,
      });
  }
  for (const space of spaces) {
    const { x, y } = space.anchor;
    const width = Math.max(74, space.name.length * 6.4 + 20);
    const badge = element('g', {
      class: `directory-space-label is-${space.kind}`,
      'data-source-space': space.id,
      'pointer-events': 'none',
      transform: `translate(${x} ${y}) rotate(90)`,
    });
    badge.append(element('rect', { x: -width / 2, y: -12, width, height: 24, rx: 8 }));
    text(badge, space.name, {
      x: 0,
      y: 1,
      'dominant-baseline': 'middle',
      'text-anchor': 'middle',
      'font-size': 11,
    });
    layer.append(badge);
  }
  const icons: Record<string, string> = {
    lift: liftIcon,
    stairs: stairsIcon,
    escalator: escalatorIcon,
    'washroom-male': maleWashroomIcon,
    'washroom-female': femaleWashroomIcon,
  };
  for (const [kind, raw] of Object.entries(icons)) {
    const symbol = element('symbol', { id: `directory-icon-${kind}`, viewBox: '0 0 24 24' });
    const icon = new DOMParser().parseFromString(raw, 'image/svg+xml');
    for (const child of [...icon.documentElement.children])
      symbol.append(document.importNode(child, true));
    defs.append(symbol);
  }
  const gateSymbol = element('symbol', { id: 'directory-icon-entrance', viewBox: '0 0 24 24' });
  gateSymbol.append(element('path', { d: GATE_ICON_PATH }));
  defs.append(gateSymbol);
  for (const amenity of model.amenities) {
    const [x, y] = amenity.point;
    const entry = amenity.kind === 'entrance';
    const washroom = amenity.kind === 'washroom';
    const female = washroom && 'gender' in amenity && amenity.gender === 'female';
    const compactWashroom = washroom && amenity.id !== 'washrooms';
    const alignsWithArchitecture = amenity.kind === 'stairs' || amenity.kind === 'escalator';
    const g = element('g', {
      class: `directory-amenity${entry ? ' is-entry' : ''}${washroom ? ` is-washroom${female ? ' is-female' : ' is-male'}${compactWashroom ? ' is-compact' : ''}` : ''}`,
      transform: `translate(${x} ${y})${alignsWithArchitecture ? ('rotation' in amenity ? ` rotate(${amenity.rotation})` : '') : ' rotate(90)'}`,
      'data-place-id': amenity.id,
      tabindex: 0,
      role: 'button',
      'aria-label': amenity.name,
    });
    if (amenity.kind === 'stairs')
      g.append(
        element('use', { href: '#directory-stair-top', x: -12, y: -18, width: 24, height: 36 }),
      );
    else if (amenity.kind === 'escalator') {
      g.append(
        element('use', {
          href: '#directory-escalator-top',
          x: -56,
          y: -10,
          width: 112,
          height: 20,
        }),
      );
    } else {
      const tileSize = compactWashroom ? 27 : washroom ? 36 : 28;
      const iconSize = compactWashroom ? 21 : washroom ? 26 : 20;
      g.append(
        element('rect', {
          class: 'directory-amenity-tile',
          x: -tileSize / 2,
          y: -tileSize / 2,
          width: tileSize,
          height: tileSize,
          rx: 6,
        }),
      );
      g.append(
        element('use', {
          href: `#directory-icon-${washroom ? `washroom-${female ? 'female' : 'male'}` : amenity.kind}`,
          x: -iconSize / 2,
          y: -iconSize / 2,
          width: iconSize,
          height: iconSize,
          'pointer-events': 'none',
        }),
      );
    }
    if (entry)
      text(g, amenity.id === 'ground-entry-starbucks' ? 'ENTRY 1' : 'ENTRY 2', {
        x: 0,
        y: 29,
        'text-anchor': 'middle',
        'font-size': 10,
        'pointer-events': 'none',
      });
    if (washroom && !compactWashroom) {
      const caption = element('g', { class: 'directory-amenity-caption' });
      caption.append(element('rect', { x: -23, y: 20, width: 46, height: 19, rx: 5 }));
      text(caption, 'MEN', {
        x: 0,
        y: 33,
        'text-anchor': 'middle',
        'font-size': 11,
        'pointer-events': 'none',
      });
      g.append(caption);
    }
    layer.append(g);
  }
  const entryOne = model.amenities.find((a) => a.id === 'ground-entry-starbucks')!;
  if (!entryOne) return;
  const [originX, originY] = entryOne.point;
  const pin = element('g', {
    class: 'directory-origin-pin',
    'data-directory-origin-pin': '',
    'pointer-events': 'none',
    transform: `translate(${originX} ${originY}) rotate(90)`,
  });
  pin.append(element('path', { class: 'directory-here-pin', d: HERE_PIN_PATH }));
  pin.append(element('circle', { class: 'directory-here-dot', cx: 0, cy: -31, r: 6 }));
  pin.append(
    element('rect', {
      class: 'directory-here-caption',
      x: -134,
      y: -43,
      width: 112,
      height: 26,
      rx: 6,
    }),
  );
  text(pin, 'YOU ARE HERE', {
    x: -78,
    y: -26,
    'text-anchor': 'middle',
    'font-size': 11,
    class: 'directory-here-text',
  });
  layer.append(pin);
}
