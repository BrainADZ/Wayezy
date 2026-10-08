import { mediaPath } from '../../../packages/domain';
import {
  directoryUnits,
  tenantForDirectoryUnit,
} from '../../../packages/domain/reference/architectural-directory';
import type { MapPlace } from './explorer-model';
import { invalidateDirectoryState } from './ground-directory-state';

const NS = 'http://www.w3.org/2000/svg';
type UnitContent = {
  elements: SVGElement[];
  brand?: SVGGElement;
  signature?: string;
  baseline?: Element;
  baselineLogo?: string;
};
const cache = new WeakMap<SVGSVGElement, Map<string, UnitContent>>();

/** Update saved occupancy and labels without rebuilding or measuring architectural paths. */
export function updateDirectoryContent(svg: SVGSVGElement, floorId: string, places: MapPlace[]) {
  let units = cache.get(svg);
  if (!units) {
    units = new Map();
    for (const element of svg.querySelectorAll<SVGElement>(
      '[data-module-id],[data-brand-module]',
    )) {
      const id =
        element.getAttribute('data-module-id') ?? element.getAttribute('data-brand-module')!;
      const entry: UnitContent = units.get(id) ?? { elements: [] };
      entry.elements.push(element);
      if (element.classList.contains('directory-brand')) {
        entry.brand = element as SVGGElement;
        entry.baseline = element.firstElementChild?.cloneNode(true) as Element | undefined;
        entry.baselineLogo = entry.baseline?.querySelector('image')?.getAttribute('href') ?? '';
      }
      units.set(id, entry);
    }
    cache.set(svg, units);
  }
  const tenants = places.flatMap((place) => (place.tenant ? [place.tenant] : []));
  let changed = false;
  for (const unit of directoryUnits.filter((unit) => unit.floorId === floorId)) {
    const entry = units.get(unit.module.id);
    if (!entry) continue;
    const tenant = tenantForDirectoryUnit(unit, tenants);
    const name =
      tenant && tenant.name === unit.defaultName
        ? (unit.defaultLabel ?? tenant.name)
        : (tenant?.name ?? 'TO LET');
    const logo = tenant?.logo ?? '';
    const signature = JSON.stringify([tenant?.id, name, logo, tenant?.categoryId]);
    if (signature === entry.signature) continue;
    entry.signature = signature;
    changed = true;
    for (const element of entry.elements) {
      element.setAttribute('data-place-id', tenant?.id ?? '');
      if (!element.hasAttribute('data-module-id')) continue;
      element.setAttribute('data-category', tenant?.categoryId ?? 'unoccupied');
      element.querySelector('title')?.remove();
      if (tenant) {
        const title = document.createElementNS(NS, 'title');
        title.textContent = tenant.name;
        element.append(title);
      }
      if (element.hasAttribute('role')) {
        element.setAttribute('role', tenant ? 'button' : 'img');
        element.setAttribute('tabindex', tenant ? '0' : '-1');
        element.setAttribute('aria-label', `${tenant?.name ?? 'Retail'} · Unit ${unit.unitNumber}`);
      }
    }
    const content = entry.brand?.firstElementChild;
    if (!content) continue;
    const unchanged =
      (!tenant && !unit.defaultTenantId) ||
      (tenant?.id === unit.defaultTenantId &&
        tenant?.name === unit.defaultName &&
        logo === entry.baselineLogo);
    if (unchanged && entry.baseline) {
      content.replaceChildren(
        ...[...entry.baseline.childNodes].map((node) => node.cloneNode(true)),
      );
      continue;
    }
    const width = unit.module.labelBox.height,
      height = unit.module.labelBox.width;
    content.replaceChildren();
    if (logo && mediaPath.safeParse(logo).success) {
      const image = document.createElementNS(NS, 'image');
      const attrs = {
        href: logo,
        x: -width * 0.44,
        y: -height * 0.43,
        width: width * 0.88,
        height: height * 0.86,
        preserveAspectRatio: 'xMidYMid meet',
        'data-map-logo': tenant!.id,
        'data-local-brand-logo': tenant!.id.replace(/^(ground|first)-tenant-/, ''),
      };
      for (const [key, value] of Object.entries(attrs)) image.setAttribute(key, String(value));
      content.append(image);
      continue;
    }
    const words = name.split(/\s+/);
    const lines = [name];
    if (
      words.length > 1 &&
      ((height > 42 && width < name.length * 10) || (!tenant && height > width * 1.4))
    ) {
      let first = words.shift()!;
      while (words.length > 1 && first.length < name.length / 2) first += ` ${words.shift()}`;
      lines.splice(0, 1, first, words.join(' '));
    }
    const fontSize = Math.min(
      tenant ? 19 : 15,
      (height * 0.64) / lines.length,
      (width * 0.93) / (Math.max(1, ...lines.map((line) => line.length)) * 0.54),
    );
    lines.forEach((line, index) => {
      const text = document.createElementNS(NS, 'text');
      const attrs = {
        x: 0,
        y: (index - (lines.length - 1) / 2) * fontSize * 1.1,
        'font-size': fontSize,
        'dominant-baseline': 'central',
        'text-anchor': 'middle',
        class: tenant ? 'directory-store-name' : 'directory-unit-name',
        'data-brand': tenant?.id.replace(/^(ground|first)-tenant-/, '') ?? '',
      };
      for (const [key, value] of Object.entries(attrs)) text.setAttribute(key, String(value));
      text.textContent = line;
      content.append(text);
    });
  }
  if (changed) invalidateDirectoryState(svg);
}
