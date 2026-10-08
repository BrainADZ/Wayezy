import { rootMatrix, type FloorModel } from '../../../packages/svg-retail/ground-model';
import { svgElement } from './ground-environment';

/** Surface and entrance styling follow source tiles, edges and recessed storefront openings. */
export function addFirstFloorEnvironment(
  svg: SVGSVGElement,
  model: FloorModel,
  defs: SVGDefsElement,
  underlay: SVGGElement,
  overlay: SVGGElement,
) {
  const circulation = model.circulation;
  if (!circulation) return;
  const source = new Map(
    [...svg.querySelectorAll<SVGGeometryElement>('[id]')].map((el) => [el.id, el]),
  );
  const copy = (id: string) => {
    const original = source.get(id);
    if (!original) throw new Error(`Missing First Floor circulation path ${id}.`);
    const m = rootMatrix(original, svg),
      clone = original.cloneNode(false) as SVGGeometryElement;
    for (const attr of [...clone.attributes])
      if (!['d', 'points', 'x', 'y', 'width', 'height'].includes(attr.name))
        clone.removeAttribute(attr.name);
    clone.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
    clone.setAttribute('data-circulation-source', id);
    return { original, clone, scale: Math.hypot(m.a, m.b) };
  };
  const pattern = svgElement('pattern', {
    id: 'first-void-hatch',
    width: 10,
    height: 10,
    patternUnits: 'userSpaceOnUse',
  });
  pattern.append(
    svgElement('path', {
      d: 'M-2 2L2-2M0 10L10 0M8 12L12 8',
      stroke: '#a5b5a1',
      'stroke-width': 0.55,
      opacity: 0.42,
    }),
  );
  defs.append(pattern);
  const surface = svgElement('g', {
    class: 'first-walkway-surface',
    'pointer-events': 'none',
    'aria-hidden': 'true',
  });
  for (const id of circulation.tileSourceIds) {
    const { original, clone, scale } = copy(id);
    original.setAttribute('data-map-paint', 'walkway-tile');
    clone.setAttribute('fill', 'none');
    clone.setAttribute('stroke', '#e3e9dc');
    clone.setAttribute('stroke-width', String((circulation.tileSpacing + 0.12) / scale));
    clone.setAttribute('stroke-linecap', 'butt');
    surface.append(clone);
  }
  underlay.append(surface);
  for (const area of circulation.voids) {
    const pocket = svgElement('g', {
      class: 'first-floor-void',
      'data-void-id': area.id,
      'data-void-kind': area.kind,
      'pointer-events': 'none',
      'aria-label': 'Open to below',
    });
    for (const id of area.sourceIds) {
      const { original, clone } = copy(id);
      original.setAttribute('data-map-paint', 'void-edge');
      clone.setAttribute('fill', '#eef0e5');
      clone.setAttribute('stroke', 'none');
      pocket.append(clone);
      const hatch = clone.cloneNode(false) as SVGGeometryElement;
      hatch.setAttribute('fill', 'url(#first-void-hatch)');
      pocket.append(hatch);
    }
    underlay.append(pocket);
    // Hide the drafting diagonals within a void; retain every original source vector.
    for (const original of source.values()) {
      if (original.parentElement?.id !== 'layer-MC75') continue;
      const d = original.getAttribute('d') ?? '';
      if (!/^M\s*0,0\s*-?\d+,-?\d+$/.test(d)) continue;
      // The original X marks use these ten source IDs for the five confirmed voids.
      if (/^path796[0-9]$/.test(original.id))
        original.setAttribute('data-map-paint', 'void-annotation');
    }
  }
  for (const id of circulation.edgeSourceIds)
    source.get(id)?.setAttribute('data-map-paint', 'walkway-edge');
  const entrances = svgElement('g', {
    class: 'first-store-entrances',
    'pointer-events': 'none',
    'aria-hidden': 'true',
  });
  for (const opening of circulation.openings) {
    const points = opening.points.map((p) => `${p.x},${p.y}`).join(' ');
    const frame = svgElement('g', {
      'data-store-opening': opening.id,
      'data-opening-module': opening.moduleId,
      'data-source-perimeter': opening.sourceId,
    });
    frame.append(svgElement('polyline', { points, class: 'first-entrance-halo' }));
    frame.append(svgElement('polyline', { points, class: 'first-entrance-frame' }));
    entrances.append(frame);
  }
  overlay.append(entrances);
  for (const [index, area] of circulation.voids
    .filter((area) => ['first-north-courtyard', 'first-south-atrium'].includes(area.id))
    .entries()) {
    const x = index === 0 ? area.bounds.x + area.bounds.width + 11 : area.bounds.x - 12;
    const label = svgElement('text', {
      class: 'first-walkway-label',
      'data-walkway-label': area.id,
      x,
      y: area.anchor.y,
      transform: `rotate(90 ${x} ${area.anchor.y})`,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 8,
      'pointer-events': 'none',
    });
    label.textContent = 'WALKWAY';
    overlay.append(label);
  }
}
