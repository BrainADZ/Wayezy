import { useEffect, useRef } from 'react';
import { FIRST_FLOOR_SOURCE } from '../../../packages/domain/reference/first-floor-layout';
import type { GroundFloorStatus } from './ground-floor';
import model from '../../../packages/domain/reference/first-floor-model.json';
import prepared from '../../../packages/domain/reference/first-floor-prepared.json';
import { updateDirectoryState } from './ground-directory-state';
import type { MapPlace } from './explorer-model';
import { updateDirectoryContent } from './directory-live-content';
import './ground-directory.css';

/** The same prepared directory presentation as Ground Floor, with First Floor source geometry. */
export function FirstFloor({
  onStatus,
  places,
  selectedId,
  matchingIds,
  onSelect,
}: {
  onStatus: (status: GroundFloorStatus) => void;
  places: MapPlace[];
  selectedId?: string;
  matchingIds?: string[];
  onSelect: (place: MapPlace) => void;
}) {
  const host = useRef<SVGGElement>(null);
  const sourceRef = useRef<SVGSVGElement>(undefined);
  const hovered = useRef<string>(undefined);
  const live = useRef({ places, selectedId, matchingIds, onSelect });
  live.current = { places, selectedId, matchingIds, onSelect };

  useEffect(() => {
    const controller = new AbortController();
    const container = host.current!;
    let disposed = false;
    onStatus({ state: 'loading' });
    container.setAttribute('data-map-status', 'loading');

    async function load() {
      try {
        const response = await fetch(prepared.url, { signal: controller.signal });
        if (!response.ok)
          throw new Error(`First Floor map could not be loaded (${response.status}).`);
        const raw = await response.text();
        const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
        if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg')
          throw new Error('First Floor map is not a valid SVG drawing.');
        if (
          doc.documentElement.getAttribute('data-source-sha256') !== model.sourceSha256 ||
          doc.documentElement.getAttribute('data-prepared-directory') !== 'first-1'
        )
          throw new Error('The prepared First Floor map is out of date. Rebuild the directory.');
        await document.fonts.load('600 16px Inter');
        if (disposed) return;
        const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
        sourceRef.current = svg;
        updateDirectoryContent(svg, 'l1', live.current.places);
        updateDirectoryState(svg, live.current.selectedId, live.current.matchingIds);
        container.replaceChildren(svg);
        container.setAttribute('data-map-status', 'ready');
        container.setAttribute('data-detected-modules', String(model.modules.length));
        onStatus({ state: 'ready' });
        container.dispatchEvent(new CustomEvent('way-ezy-map-ready', { bubbles: true }));
      } catch (error) {
        if (disposed) return;
        container.setAttribute('data-map-status', 'error');
        onStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'First Floor map could not be loaded.',
        });
      }
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
      container.replaceChildren();
      sourceRef.current = undefined;
    };
  }, [onStatus]);

  useEffect(() => {
    if (!sourceRef.current) return;
    updateDirectoryContent(sourceRef.current, 'l1', places);
    updateDirectoryState(sourceRef.current, selectedId, matchingIds, hovered.current);
  }, [places]);

  useEffect(() => {
    if (sourceRef.current)
      updateDirectoryState(sourceRef.current, selectedId, matchingIds, hovered.current);
  }, [selectedId, matchingIds]);

  function select(target: EventTarget) {
    const id = (target as Element).closest('[data-place-id]')?.getAttribute('data-place-id');
    const place = live.current.places.find((place) => place.id === id);
    if (place) live.current.onSelect(place);
  }

  return (
    <g
      ref={host}
      className="first-floor-source"
      data-source={FIRST_FLOOR_SOURCE}
      onClick={(event) => select(event.target)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(event.target);
        }
      }}
      onFocusCapture={(event) => {
        hovered.current = (event.target as Element).getAttribute('data-module-id') ?? undefined;
        if (sourceRef.current)
          updateDirectoryState(
            sourceRef.current,
            live.current.selectedId,
            live.current.matchingIds,
            hovered.current,
          );
      }}
      onPointerOver={(event) => {
        if (event.pointerType !== 'mouse') return;
        const next =
          (event.target as Element).closest('[data-module-id]')?.getAttribute('data-module-id') ??
          undefined;
        if (hovered.current === next) return;
        hovered.current = next;
        if (sourceRef.current)
          updateDirectoryState(
            sourceRef.current,
            live.current.selectedId,
            live.current.matchingIds,
            next,
          );
      }}
      onPointerLeave={() => {
        hovered.current = undefined;
        if (sourceRef.current)
          updateDirectoryState(
            sourceRef.current,
            live.current.selectedId,
            live.current.matchingIds,
          );
      }}
    />
  );
}
