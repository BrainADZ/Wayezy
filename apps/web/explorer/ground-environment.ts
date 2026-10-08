import { rootBox, rootMatrix, type FloorModel } from '../../../packages/svg-retail/ground-model';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgElement(tag: string, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Build-time landscaping tied to source planter islands and their central median. */
export function addDirectoryDefinitions(defs: SVGDefsElement) {
  const definitions = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}">
    <filter id="directory-depth" x="-20%" y="-30%" width="140%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="5" stdDeviation="1.1" flood-color="#827563" flood-opacity=".26"/>
      <feDropShadow dx="0" dy="2" stdDeviation=".4" flood-color="#8e806e" flood-opacity=".32"/>
    </filter>
    <filter id="directory-selected-depth" x="-25%" y="-35%" width="150%" height="180%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="7" stdDeviation="3" flood-color="#004c40" flood-opacity=".32"/>
    </filter>
    <linearGradient id="directory-water" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6c9695"/><stop offset=".35" stop-color="#94bab3"/>
      <stop offset=".72" stop-color="#83ada9"/><stop offset="1" stop-color="#648f91"/>
    </linearGradient>
    <symbol id="directory-canopy-a" viewBox="-12 -12 24 24">
      <path d="M-10-2C-11-6-7-10-3-9C1-12 6-10 8-6C12-3 11 2 8 5C7 10 2 11-2 9C-7 10-11 5-10 1Z" fill="#587b63"/>
      <path d="M-8-3C-5-8 0-9 4-6C8-6 9-1 6 3C3 7-2 8-6 5C-9 3-9 0-8-3Z" fill="#7f9d78"/>
      <path d="M-6-4C-3-6-1-6 2-5M1 6C4 5 6 3 7 1" fill="none" stroke="#a8bea0" stroke-width="1.2" opacity=".65"/>
    </symbol>
    <symbol id="directory-canopy-b" viewBox="-12 -12 24 24">
      <path d="M-9-4C-8-8-4-10 0-8C5-11 9-7 9-3C12 1 9 5 6 7C2 11-2 9-5 8C-10 7-12 1-9-4Z" fill="#55755f"/>
      <path d="M-7-3C-5-7-1-6 1-7C6-7 8-3 7 1C6 6 2 7-2 6C-6 5-8 1-7-3Z" fill="#89a47f"/>
      <path d="M-5 2C-3 4 0 5 2 4M2-4C4-3 5-1 5 1" fill="none" stroke="#b3c5a8" stroke-width="1" opacity=".58"/>
    </symbol>
    <symbol id="directory-canopy-c" viewBox="-12 -12 24 24">
      <path d="M-10-1C-11-5-7-8-4-9C-1-11 4-9 6-7C10-7 11-2 9 2C10 6 6 9 2 9C-2 11-6 8-8 5C-11 4-11 1-10-1Z" fill="#607e68"/>
      <path d="M-8-2C-6-5-3-7 0-6C4-8 8-3 7 1C6 4 3 6-1 6C-5 7-9 3-8-2Z" fill="#92aa85"/>
      <path d="M-5-2C-3-4-1-4 1-4M1 4C3 4 5 2 5 0" fill="none" stroke="#bdcdb4" stroke-width="1" opacity=".58"/>
    </symbol>
    <symbol id="directory-stair-top" viewBox="0 0 24 36">
      <rect x="1" y="1" width="22" height="34" rx="2" fill="#ece7dc" stroke="#a49c8b"/>
      <path d="M3 6H21M3 10H21M3 14H21M3 18H21M3 22H21M3 26H21M3 30H21" stroke="#a49c8b" stroke-width="1"/>
      <path d="M12 29V8M8 12L12 8L16 12" fill="none" stroke="#4b625a" stroke-width="1.6"/>
    </symbol>
    <symbol id="directory-escalator-top" viewBox="0 0 100 20">
      <rect x="1" y="1" width="98" height="18" rx="7" fill="#c3c9c2" stroke="#74857c"/>
      <path d="M12 4H88V16H12Z" fill="#e4e7df"/>
      <path d="M18 4V16M24 4V16M30 4V16M36 4V16M42 4V16M48 4V16M54 4V16M60 4V16M66 4V16M72 4V16M78 4V16M84 4V16" stroke="#9aaba0"/>
      <path d="M12 2H88M12 18H88" stroke="#65796f" stroke-width="2"/>
    </symbol>
  </svg>`,
    'image/svg+xml',
  );
  for (const child of [...definitions.documentElement.children])
    defs.append(document.importNode(child, true));
}

export function addEnvironment(
  svg: SVGSVGElement,
  defs: SVGDefsElement,
  underlay: SVGGElement,
  overlay: SVGGElement,
  model: FloorModel,
) {
  addDirectoryDefinitions(defs);

  // Use the same source-confirmed aisles as routing; render all outlines first so
  // crossing corridors read as a continuous surface rather than stacked stripes.
  const floor = svgElement('g', { class: 'directory-circulation', 'pointer-events': 'none' });
  for (const outline of [true, false]) {
    for (const forecourt of model.circulation?.forecourts ?? [])
      floor.append(
        svgElement('rect', {
          ...forecourt.bounds,
          'data-ground-forecourt': forecourt.id,
          fill: '#e3e9dc',
          stroke: outline ? '#a3b39b' : 'none',
          'stroke-width': 1.2,
        }),
      );
    for (const walkway of model.circulation?.walkways ?? [])
      floor.append(
        svgElement('polyline', {
          points: walkway.points.map((p) => `${p.x},${p.y}`).join(' '),
          'data-ground-walkway': walkway.id,
          'data-walkway-treatment': outline ? 'edge' : 'surface',
          fill: 'none',
          stroke: outline ? '#a3b39b' : '#e3e9dc',
          'stroke-width': walkway.width + (outline ? 1.2 : 0),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
  }
  underlay.append(floor);
  const entrances = svgElement('g', {
    class: 'directory-store-entrances',
    'pointer-events': 'none',
  });
  for (const opening of model.circulation?.openings ?? []) {
    const frame = svgElement('g', {
      'data-store-opening': opening.id,
      'data-opening-module': opening.moduleId,
      'data-source-perimeter': opening.sourceId,
    });
    const points = opening.points.map((p) => `${p.x},${p.y}`).join(' ');
    frame.append(svgElement('polyline', { points, class: 'directory-entrance-halo' }));
    frame.append(svgElement('polyline', { points, class: 'directory-entrance-frame' }));
    const [a, b, c, d] = opening.points;
    const leafPoints = [
      [
        a,
        {
          x: a.x + (b.x - a.x) * 0.45 + (d.x - a.x) * 0.3,
          y: a.y + (b.y - a.y) * 0.45 + (d.y - a.y) * 0.3,
        },
      ],
      [
        d,
        {
          x: d.x + (c.x - d.x) * 0.45 + (a.x - d.x) * 0.3,
          y: d.y + (c.y - d.y) * 0.45 + (a.y - d.y) * 0.3,
        },
      ],
    ];
    for (const leaf of leafPoints)
      frame.append(
        svgElement('polyline', {
          points: leaf.map((p) => `${p.x},${p.y}`).join(' '),
          class: 'directory-door-leaf',
        }),
      );
    entrances.append(frame);
  }
  overlay.append(entrances);
  for (const [i, [x, y]] of [
    [440, 555],
    [345, 970],
  ].entries()) {
    const label = svgElement('text', {
      class: 'directory-walkway-label',
      'data-walkway-label': `ground-walkway-${i + 1}`,
      x,
      y,
      transform: `rotate(90 ${x} ${y})`,
      'font-size': 8,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'pointer-events': 'none',
    });
    label.textContent = 'WALKWAY';
    overlay.append(label);
  }
  // The water belongs in the narrow landscaped median indicated by the plan,
  // between the two rows of source planter islands. Breaks preserve cross-aisles.
  const water = svgElement('g', {
    class: 'directory-water-features',
    'pointer-events': 'none',
    'aria-hidden': 'true',
  });
  for (const [index, [top, bottom]] of [
    [535, 584],
    [650, 738],
    [799, 868],
    [1028, 1148],
  ].entries()) {
    const pool = svgElement('g', {
      class: 'directory-pond',
      'data-pond-zone': 'central-median',
      'data-pond-index': index,
    });
    const height = bottom - top;
    const drift = [0, 0.6, -0.5, 0.3][index],
      left = 382 + drift,
      middle = left + 10;
    pool.append(
      svgElement('rect', {
        x: left,
        y: top,
        width: 20,
        height,
        rx: 2.5,
        fill: '#d8d8cd',
        stroke: '#b8c2b6',
        'stroke-width': 1.1,
      }),
    );
    pool.append(
      svgElement('rect', {
        x: left + 2,
        y: top + 2,
        width: 16,
        height: height - 4,
        rx: 1.5,
        fill: 'url(#directory-water)',
      }),
    );
    pool.append(
      svgElement('path', {
        d: `M${middle - 3} ${top + 8} C${middle - 4} ${top + height * 0.33} ${middle - 2} ${top + height * 0.65} ${middle - 3} ${bottom - 8}`,
        fill: 'none',
        stroke: '#d5e7dc',
        'stroke-width': 0.8,
        opacity: 0.45,
      }),
    );
    water.append(pool);
  }
  const decor = svgElement('g', {
    class: 'directory-decor',
    'pointer-events': 'none',
    'aria-hidden': 'true',
  });
  overlay.append(decor);
  decor.append(water);
  // Exact source island outlines. Decoration is clipped inside these original outlines.
  const islands = [
    'path6217',
    'path6211',
    'path6205',
    'path6208',
    'path6202',
    'path6199',
    'path6196',
    'path6214',
    'path6220',
  ];
  for (const [i, id] of islands.entries()) {
    const source = svg.querySelector<SVGGraphicsElement>(`#${id}`);
    if (!source) throw new Error(`Missing decor island ${id}`);
    const b = rootBox(source, svg),
      m = rootMatrix(source, svg);
    const clip = svgElement('clipPath', { id: `island-${id}`, clipPathUnits: 'userSpaceOnUse' });
    const copy = source.cloneNode(false) as SVGElement;
    for (const attr of [...copy.attributes])
      if (!['d', 'points'].includes(attr.name)) copy.removeAttribute(attr.name);
    copy.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
    clip.append(copy);
    defs.append(clip);
    const pocket = svgElement('g', { 'clip-path': `url(#island-${id})`, 'data-decor-source': id });
    pocket.append(
      svgElement('rect', { x: b.x, y: b.y, width: b.width, height: b.height, fill: '#d7e0d2' }),
    );
    let y = b.y + 16,
      n = 0;
    while (y < b.y + b.height - 11) {
      const width = Math.min(b.width - 1.5, 14 + ((i * 7 + n * 5) % 6));
      const x = b.x + b.width / 2 + Math.sin(i * 2 + n * 3) * 1.1;
      const symbol = ['a', 'b', 'c'][(i + n) % 3];
      pocket.append(
        svgElement('use', {
          href: `#directory-canopy-${symbol}`,
          x: x - width / 2,
          y: y - width / 2,
          width,
          height: width,
          transform: `rotate(${((i * 37 + n * 53) % 110) - 55} ${x} ${y})`,
        }),
      );
      n++;
      y += [36, 43, 39, 47][(i + n) % 4];
    }
    decor.append(pocket);
  }
}
