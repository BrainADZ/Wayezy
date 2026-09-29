/** Browser-native SVG inspection. Bounding boxes are metadata, never replacement geometry. */
const NS = 'http://www.w3.org/2000/svg';
const excluded = 'defs,clipPath,mask,pattern,marker,symbol,[data-retail-overlay]';
export type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type RGB = [number, number, number];
type Label = { id: string; text: string; box: Box; center: Point };
type Shape = {
  element: SVGGeometryElement;
  index: number;
  box: Box;
  matrix: DOMMatrix;
  inverse: DOMMatrix;
  color: RGB;
  area: number;
};
export type ModuleMatch = {
  id: string;
  text: string;
  status: 'detected' | 'uncertain' | 'unmatched';
  method: 'contains' | 'nearest' | 'none';
  reasons: string[];
  labelBox: Box;
  footprintBox?: Box;
  shapeIndexes: number[];
  distance?: number;
};
export type DetectionReport = {
  version: 1;
  source?: string;
  greenFill?: string;
  inspectedShapes: number;
  greenShapes: number;
  footprintCandidates: number;
  modules: ModuleMatch[];
  unassigned: { shapeIndexes: number[]; box: Box; reason: string }[];
  warnings: string[];
  settings: {
    minimumArea: number;
    minimumFragmentArea: number;
    joinTolerance: number;
    colorTolerance: number;
  };
};
export type DetectionOptions = {
  minimumArea?: number;
  minimumFragmentArea?: number;
  joinTolerance?: number;
  colorTolerance?: number;
  greenFill?: RGB;
};

export function normalizeModuleId(value: string) {
  const match = value
    .toUpperCase()
    .match(/RETAIL\s*MODULE\s*[-–—]?\s*(\d+)\s*[-–—]?\s*([A-Z]\d*)?/);
  return match ? `module-${Number(match[1])}${(match[2] ?? '').toLowerCase()}` : undefined;
}

/** Trusted local architectural assets only. Reject active/external SVG content before insertion. */
export function parsePlan(source: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg')
    throw new Error('The source is not a valid SVG document.');
  for (const el of doc.querySelectorAll('*')) {
    if (['script', 'foreignObject', 'animate', 'animateTransform', 'set'].includes(el.localName))
      throw new Error(`Unsupported active SVG element: ${el.localName}`);
    for (const attr of el.attributes) {
      if (
        /^on/i.test(attr.name) ||
        (attr.localName === 'href' && !attr.value.startsWith('#')) ||
        /url\(\s*['"]?(?!#)/i.test(attr.value)
      )
        throw new Error('External or active SVG content is not supported.');
    }
    if (el.localName === 'style' && /@import|url\(\s*['"]?(?!#)/i.test(el.textContent ?? ''))
      throw new Error('External SVG styles are not supported.');
  }
  return document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
}

function rgb(fill: string): RGB | undefined {
  const values = fill.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return values ? [Number(values[1]), Number(values[2]), Number(values[3])] : undefined;
}
function isGreen([r, g, b]: RGB) {
  return g > r + 5 && g > b + 12 && g > 45;
}
function colorDistance(a: RGB, b: RGB) {
  return Math.hypot(...a.map((v, i) => v - b[i]));
}
function center(b: Box): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
function boxDistance(p: Point, b: Box) {
  return Math.hypot(
    Math.max(b.x - p.x, 0, p.x - b.x - b.width),
    Math.max(b.y - p.y, 0, p.y - b.y - b.height),
  );
}
function matrixToRoot(el: SVGGraphicsElement, svg: SVGSVGElement) {
  return svg.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!);
}
function transformedBox(b: Box, m: DOMMatrix): Box {
  const points = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
  return union(points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })));
}
function bounds(el: SVGGraphicsElement, svg: SVGSVGElement): Box {
  return transformedBox(el.getBBox(), matrixToRoot(el, svg));
}
function visible(el: SVGGraphicsElement) {
  if (el.closest(excluded)) return false;
  for (let p: Element | null = el; p; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
      return false;
  }
  return true;
}
function contains(shape: Shape, p: Point) {
  return shape.element.isPointInFill(new DOMPoint(p.x, p.y).matrixTransform(shape.inverse));
}

function readLabels(svg: SVGSVGElement): Label[] {
  // PDF outline exports preserve characters on <use data-text>. Keep a character-to-element
  // map so each label gets its own bounds even when one PDF group holds many shop labels.
  const runs = new Map<Element, SVGGraphicsElement[]>();
  for (const el of svg.querySelectorAll<SVGGraphicsElement>('text,use[data-text]')) {
    if (!visible(el)) continue;
    const key = el.localName === 'text' ? el : el.parentElement!;
    runs.set(key, [...(runs.get(key) ?? []), el]);
  }
  const labels: Label[] = [];
  for (const elements of runs.values()) {
    const chars: { char: string; element: SVGGraphicsElement; characterIndex: number }[] = [];
    for (const element of elements) {
      const value =
        element.localName === 'text'
          ? (element.textContent ?? '')
          : (element.getAttribute('data-text') ?? '');
      let characterIndex = 0;
      for (const char of value.toUpperCase())
        chars.push({ char, element, characterIndex: characterIndex++ });
    }
    const text = chars.map((c) => c.char).join('');
    // Look ahead for another RETAIL token so concatenated outline runs cannot consume its R as a suffix.
    const pattern =
      /RETAIL\s*MODULE\s*[-–—]?\s*\d+(?:\s*[-–—]?\s*(?!RETAIL|MODULE|LIFT|CORE)[A-Z](?:\d+)?(?=\s|$|RETAIL|MODULE|LIFT|CORE))?/g;
    for (const match of text.matchAll(pattern)) {
      const selected = chars
        .slice(match.index, match.index + match[0].length)
        .filter((c) => c.char.trim());
      const box = union(
        selected.map(({ element, characterIndex }) => {
          if (element instanceof SVGTextElement && characterIndex < element.getNumberOfChars()) {
            return transformedBox(
              element.getExtentOfChar(characterIndex),
              matrixToRoot(element, svg),
            );
          }
          return bounds(element, svg);
        }),
      );
      labels.push({ id: normalizeModuleId(match[0])!, text: match[0], box, center: center(box) });
    }
  }
  // Some PDF labels cross unrelated XML groups (e.g. RETAIL / MODULE / 20).
  // Recover nearby horizontal glyph lines without relying on the exporter's grouping.
  const glyphs = [...svg.querySelectorAll<SVGGraphicsElement>('use[data-text]')]
    .filter(visible)
    .map((el) => ({ text: el.getAttribute('data-text')!, box: bounds(el, svg) }))
    .filter((g) => g.text.trim() && g.box.height > 0);
  for (const el of svg.querySelectorAll<SVGTextElement>('text')) {
    if (!visible(el)) continue;
    const text = el.textContent ?? '';
    const matrix = matrixToRoot(el, svg);
    for (let i = 0; i < Math.min(text.length, el.getNumberOfChars()); i++) {
      if (text[i].trim())
        glyphs.push({ text: text[i], box: transformedBox(el.getExtentOfChar(i), matrix) });
    }
  }
  const rows: (typeof glyphs)[] = [];
  for (const glyph of glyphs.sort((a, b) => center(a.box).y - center(b.box).y)) {
    const row = rows.find(
      (row) =>
        Math.abs(center(row[0].box).y - center(glyph.box).y) <
        Math.max(row[0].box.height, glyph.box.height) * 0.4,
    );
    if (row) row.push(glyph);
    else rows.push([glyph]);
  }
  const lines: { text: string; box: Box }[] = [];
  for (const row of rows) {
    const parts: (typeof glyphs)[] = [];
    for (const glyph of row.sort((a, b) => a.box.x - b.box.x)) {
      const part = parts.at(-1),
        last = part?.at(-1);
      if (
        last &&
        glyph.box.x - last.box.x - last.box.width <
          Math.max(last.box.height, glyph.box.height) * 0.8
      )
        part!.push(glyph);
      else parts.push([glyph]);
    }
    for (const part of parts)
      lines.push({ text: part.map((g) => g.text).join(''), box: union(part.map((g) => g.box)) });
  }
  for (const start of lines.filter((line) => /^RETAIL/i.test(line.text))) {
    const parts = [start];
    for (let i = 0; i < 3; i++) {
      let text = parts.map((p) => p.text).join(' ');
      if (/^RETAIL\s*MODULE\s*[-–—]?\s*\d+(?:\s*[-–—]?\s*[A-Z]\d*)?\s*$/i.test(text)) {
        if (/\d\s*$/.test(text) && !/\d\s*[-–—]?\s*[A-Z]/i.test(text)) {
          const last = parts.at(-1)!;
          const suffix = lines.find(
            (line) =>
              /^[A-Z]\d*$/i.test(line.text) &&
              line.box.y > last.box.y + last.box.height * 0.5 &&
              line.box.y - last.box.y - last.box.height < last.box.height * 2 &&
              Math.abs(center(line.box).x - center(last.box).x) < last.box.height * 2,
          );
          if (suffix) {
            parts.push(suffix);
            text += ` ${suffix.text}`;
          }
        }
        const box = union(parts.map((p) => p.box)),
          id = normalizeModuleId(text)!;
        if (
          !labels.some(
            (l) =>
              l.id === id &&
              Math.hypot(l.center.x - center(box).x, l.center.y - center(box).y) <
                Math.max(l.box.height, box.height),
          )
        )
          labels.push({ id, text, box, center: center(box) });
        break;
      }
      if (!/^RETAIL(?:\s*MODULE\s*[-–—]?)?\s*$/i.test(text)) break;
      const last = parts.at(-1)!;
      const next = lines
        .filter(
          (line) =>
            line !== last &&
            line.box.y > last.box.y + last.box.height * 0.5 &&
            line.box.y - last.box.y - last.box.height < last.box.height * 2 &&
            (Math.abs(line.box.x - last.box.x) < last.box.height * 2 ||
              Math.abs(center(line.box).x - center(last.box).x) < last.box.height * 2),
        )
        .sort((a, b) => a.box.y - b.box.y)[0];
      if (!next) break;
      parts.push(next);
    }
  }
  // Prefer a complete multiline suffix over a partial numeric-only label at the same position.
  return labels.filter(
    (label) =>
      !labels.some(
        (other) =>
          other !== label &&
          /^module-\d+$/.test(label.id) &&
          other.id.startsWith(label.id) &&
          /[a-z]/.test(other.id.slice(label.id.length)) &&
          Math.hypot(other.center.x - label.center.x, other.center.y - label.center.y) <
            Math.max(label.box.height, other.box.height),
      ),
  );
}

/** Join only touching fill, not merely intersecting axis-aligned bounding boxes. */
function touches(a: Shape, b: Shape, epsilon: number) {
  const left = Math.max(a.box.x, b.box.x),
    right = Math.min(a.box.x + a.box.width, b.box.x + b.box.width);
  const top = Math.max(a.box.y, b.box.y),
    bottom = Math.min(a.box.y + a.box.height, b.box.y + b.box.height);
  if (left > right + epsilon || top > bottom + epsilon) return false;
  if (right - left < epsilon && bottom - top < epsilon) return false; // corner contact is not a footprint connection
  for (let i = 1; i <= 7; i++)
    for (let j = 1; j <= 3; j++) {
      const p = { x: left + ((right - left) * i) / 8, y: top + ((bottom - top) * j) / 4 };
      const near = (s: Shape) =>
        contains(s, p) ||
        [
          [epsilon, 0],
          [-epsilon, 0],
          [0, epsilon],
          [0, -epsilon],
        ].some(([x, y]) => contains(s, { x: p.x + x, y: p.y + y }));
      if (near(a) && near(b)) return true;
    }
  return false;
}

export function detectRetailModules(
  svg: SVGSVGElement,
  options: DetectionOptions = {},
): DetectionReport {
  if (!svg.isConnected || !svg.getScreenCTM())
    throw new Error('Attach the inline SVG to the document before detection.');
  const view = svg.viewBox.baseVal;
  const extent = view.width && view.height ? view : svg.getBBox();
  const pageArea = extent.width * extent.height;
  const settings = {
    minimumArea: options.minimumArea ?? pageArea * 0.0003,
    minimumFragmentArea: options.minimumFragmentArea ?? pageArea * 0.000003,
    joinTolerance: options.joinTolerance ?? Math.hypot(extent.width, extent.height) * 0.00002,
    colorTolerance: options.colorTolerance ?? 32,
  };
  const labels = readLabels(svg);
  const all = [...svg.querySelectorAll<SVGGeometryElement>('path,polygon,rect')].filter(
    (el) => !el.closest(excluded),
  );
  const greens: Shape[] = [];
  all.forEach((element, index) => {
    const style = getComputedStyle(element),
      color = rgb(style.fill);
    if (!color || !isGreen(color) || Number(style.fillOpacity) === 0 || !visible(element)) return;
    if (element.localName === 'path' && !/[zZ]/.test(element.getAttribute('d') ?? '')) return;
    const box = bounds(element, svg),
      matrix = matrixToRoot(element, svg);
    if (box.width * box.height < settings.minimumFragmentArea) return;
    // Browser fill tests honor compound subpaths, curves, winding and holes. Estimate actual
    // painted area to reject thin/decorative paths with misleadingly large bounding boxes.
    const shape: Shape = { element, index, box, matrix, inverse: matrix.inverse(), color, area: 0 };
    let hits = 0;
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 8; y++)
        if (
          contains(shape, {
            x: box.x + ((x + 0.5) * box.width) / 8,
            y: box.y + ((y + 0.5) * box.height) / 8,
          })
        )
          hits++;
    shape.area = (box.width * box.height * hits) / 64;
    if (shape.area >= settings.minimumFragmentArea) greens.push(shape);
  });
  const palette = new Map<string, { color: RGB; score: number }>();
  for (const shape of greens) {
    const key = shape.color.join(','),
      old = palette.get(key);
    const evidence = labels.filter(
      (l) => boxDistance(l.center, shape.box) === 0 && contains(shape, l.center),
    ).length;
    palette.set(key, {
      color: shape.color,
      score: (old?.score ?? 0) + shape.area + evidence * pageArea,
    });
  }
  const green =
    options.greenFill ?? [...palette.values()].sort((a, b) => b.score - a.score)[0]?.color;
  const shapes = green
    ? greens.filter((s) => colorDistance(s.color, green) <= settings.colorTolerance)
    : [];
  const parents = shapes.map((_, i) => i);
  const root = (i: number): number => (parents[i] === i ? i : (parents[i] = root(parents[i])));
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      if (touches(shapes[i], shapes[j], settings.joinTolerance)) parents[root(j)] = root(i);
    }
  const groups = new Map<number, Shape[]>();
  shapes.forEach((shape, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), shape]));
  const candidateGroups = [...groups.values()].flatMap((group) => {
    const inside = labels.filter((label) => group.some((s) => contains(s, label.center)));
    if (inside.length <= 1) return [group];
    // Touching fill is not proof of a single shop. Preserve the original large shapes
    // individually when a connected region contains different labels. Attach a small
    // fragment only when it touches exactly one of those large shapes.
    const large = group.filter((s) => s.area >= settings.minimumArea).map((s) => [s]);
    for (const small of group.filter((s) => s.area < settings.minimumArea)) {
      const neighbors = large.filter((parts) => touches(parts[0], small, settings.joinTolerance));
      if (neighbors.length === 1) neighbors[0].push(small);
    }
    return large;
  });
  const candidates = candidateGroups
    .filter((group) => group.some((s) => s.area >= settings.minimumArea))
    .map((group) => ({ shapes: group, box: union(group.map((s) => s.box)) }));
  const owners = new Map<number, ModuleMatch[]>();
  const modules: ModuleMatch[] = labels.map((label) => {
    const ranked = candidates
      .map((c, index) => ({
        index,
        contains: c.shapes.some((s) => contains(s, label.center)),
        distance: boxDistance(label.center, c.box),
      }))
      .sort((a, b) => Number(b.contains) - Number(a.contains) || a.distance - b.distance);
    const best = ranked[0];
    const maximumDistance = Math.max(label.box.width, label.box.height) * 1.5;
    if (!best || (!best.contains && best.distance > maximumDistance))
      return {
        id: label.id,
        text: label.text,
        status: 'unmatched',
        method: 'none',
        reasons: ['No green footprint within the label distance limit.'],
        labelBox: label.box,
        shapeIndexes: [],
      };
    const footprint = candidates[best.index];
    const reasons: string[] = [];
    if (!best.contains)
      reasons.push('Label center is outside the painted footprint; nearest bounding box only.');
    if (ranked[1]?.contains && best.contains)
      reasons.push('Label center is inside multiple footprints.');
    if (
      !best.contains &&
      ranked[1] &&
      ranked[1].distance - best.distance <= Math.max(settings.joinTolerance, label.box.height / 2)
    )
      reasons.push('Two footprints have similar distances.');
    const match: ModuleMatch = {
      id: label.id,
      text: label.text,
      status: reasons.length ? 'uncertain' : 'detected',
      method: best.contains ? 'contains' : 'nearest',
      reasons,
      labelBox: label.box,
      footprintBox: footprint.box,
      shapeIndexes: footprint.shapes.map((s) => s.index),
      distance: best.distance,
    };
    owners.set(best.index, [...(owners.get(best.index) ?? []), match]);
    return match;
  });
  for (const matches of owners.values())
    if (matches.length > 1)
      for (const match of matches) {
        match.status = 'uncertain';
        match.reasons.push(
          'Multiple module labels share this footprint; no automatic subdivision.',
        );
      }
  for (const match of modules)
    if (modules.filter((m) => m.id === match.id).length > 1) {
      match.status = 'uncertain';
      match.reasons.push('Duplicate module ID in source labels.');
    }
  const unassigned = candidates.flatMap((c, index) =>
    owners.has(index)
      ? []
      : [
          {
            shapeIndexes: c.shapes.map((s) => s.index),
            box: c.box,
            reason: 'Large green footprint without a matched RETAIL MODULE label.',
          },
        ],
  );
  const warnings: string[] = [];
  if (!labels.length)
    warnings.push(
      'No readable RETAIL MODULE labels found. Outlined text requires data-text metadata; no IDs were invented.',
    );
  if (!green) warnings.push('No qualifying green fill found.');
  if (unassigned.length)
    warnings.push(`${unassigned.length} green footprint candidates have no module label.`);
  if (svg.querySelector('[clip-path],mask'))
    warnings.push(
      'Matching uses source fill geometry before clipping; visually review clipped footprints.',
    );
  const report: DetectionReport = {
    version: 1,
    greenFill: green ? `rgb(${green.join(', ')})` : undefined,
    inspectedShapes: all.length,
    greenShapes: shapes.length,
    footprintCandidates: candidates.length,
    modules: modules.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    unassigned,
    warnings,
    settings,
  };
  return report;
}

/** Interaction metadata only: no visual styles, overlays, new geometry, or source ID changes. */
export function annotateRetailModules(svg: SVGSVGElement, report: DetectionReport) {
  const shapes = [...svg.querySelectorAll<SVGGeometryElement>('path,polygon,rect')].filter(
    (el) => !el.closest(excluded),
  );
  for (const el of shapes)
    for (const attr of [
      'data-module-id',
      'data-module-candidates',
      'data-retail-status',
      'data-retail-shape-index',
    ])
      el.removeAttribute(attr);
  const assignments = new Map<number, ModuleMatch[]>();
  for (const match of report.modules) {
    for (const index of match.shapeIndexes)
      assignments.set(index, [...(assignments.get(index) ?? []), match]);
  }
  for (const [index, matches] of assignments) {
    const el = shapes[index];
    if (!el) continue;
    el.setAttribute('data-retail-shape-index', String(index));
    const certain = matches.length === 1 && matches[0].status === 'detected';
    el.setAttribute('data-retail-status', certain ? 'detected' : 'uncertain');
    if (certain) el.setAttribute('data-module-id', matches[0].id);
    else
      el.setAttribute('data-module-candidates', [...new Set(matches.map((m) => m.id))].join(' '));
  }
  for (const candidate of report.unassigned) {
    for (const index of candidate.shapeIndexes)
      shapes[index]?.setAttribute('data-retail-status', 'unassigned');
  }
}

/** Optional review layer. The kiosk uses annotateRetailModules directly. */
export function applyRetailDebug(svg: SVGSVGElement, report: DetectionReport) {
  svg.querySelectorAll('[data-retail-overlay]').forEach((el) => el.remove());
  annotateRetailModules(svg, report);
  const layer = document.createElementNS(NS, 'g');
  layer.setAttribute('data-retail-overlay', '');
  layer.setAttribute('pointer-events', 'none');
  const style = document.createElementNS(NS, 'style');
  style.textContent = `svg[data-retail-debug="on"] [data-retail-status="detected"] { fill: #16b9e8 !important; fill-opacity: .65 !important; }
svg[data-retail-debug="on"] [data-retail-status="uncertain"] { fill: #ffae29 !important; fill-opacity: .7 !important; }
svg[data-retail-debug="on"] [data-retail-status="unassigned"] { fill: #d06aff !important; fill-opacity: .65 !important; }
svg:not([data-retail-debug="on"]) [data-retail-labels] { display: none; }`;
  layer.append(style);
  const textLayer = document.createElementNS(NS, 'g');
  textLayer.setAttribute('data-retail-labels', '');
  layer.append(textLayer);
  const fontSize = (svg.viewBox.baseVal.width || svg.getBBox().width) / 140;
  const addLabel = (value: string, box: Box, color: string) => {
    const text = document.createElementNS(NS, 'text'),
      p = center(box);
    text.setAttribute('x', String(p.x));
    text.setAttribute('y', String(p.y));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', color);
    text.setAttribute('stroke', 'white');
    text.setAttribute('stroke-width', String(fontSize / 3));
    text.setAttribute('paint-order', 'stroke');
    text.textContent = value;
    textLayer.append(text);
  };
  for (const match of report.modules) {
    addLabel(
      `${match.id}${match.status === 'detected' ? '' : ' ?'}`,
      match.labelBox,
      match.status === 'detected' ? '#00496b' : '#813b00',
    );
  }
  report.unassigned.forEach((candidate, i) => {
    addLabel(`unassigned-${i + 1}`, candidate.box, '#71309b');
  });
  svg.append(layer);
  svg.setAttribute('data-retail-debug', 'on');
}
