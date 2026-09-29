const rendered = new WeakMap<
  SVGSVGElement,
  { selectedId?: string; matches?: string; hoveredModule?: string }
>();

export function updateDirectoryOriginPin(
  svg: SVGSVGElement,
  originPoint?: { x: number; y: number },
) {
  const pin = svg.querySelector<SVGGElement>('[data-directory-origin-pin]');
  if (pin && originPoint)
    pin.setAttribute('transform', `translate(${originPoint.x} ${originPoint.y}) rotate(90)`);
}

export function updateDirectoryState(
  svg: SVGSVGElement,
  selectedId?: string,
  matchingIds?: string[],
  hoveredModule?: string,
) {
  const previous = rendered.get(svg);
  const matchKey = matchingIds?.join('\0');
  if (!previous || previous.selectedId !== selectedId || previous.matches !== matchKey) {
    svg.classList.toggle('directory-has-selection', !!selectedId);
    const matches = matchingIds ? new Set(matchingIds) : undefined;
    for (const el of svg.querySelectorAll<SVGElement>('[data-place-id]')) {
      const id = el.getAttribute('data-place-id') ?? '';
      el.classList.toggle('is-selected', !!id && id === selectedId);
      el.classList.toggle('is-muted', !!matches && (!id || !matches.has(id)));
      if (el.getAttribute('role') === 'button')
        el.setAttribute('aria-pressed', String(!!id && id === selectedId));
    }
  }
  if (!previous || previous.hoveredModule !== hoveredModule) {
    for (const el of svg.querySelectorAll<SVGElement>('.is-hovered'))
      el.classList.remove('is-hovered');
    if (hoveredModule)
      for (const el of svg.querySelectorAll<SVGElement>('[data-module-id],[data-brand-module]')) {
        if (
          (el.getAttribute('data-module-id') ?? el.getAttribute('data-brand-module')) ===
          hoveredModule
        )
          el.classList.add('is-hovered');
      }
  }
  rendered.set(svg, { selectedId, matches: matchKey, hoveredModule });
}
