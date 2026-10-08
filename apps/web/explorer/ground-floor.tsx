import { useEffect, useRef } from 'react';
import type { Box } from '../../../packages/svg-retail/detect';
import { updateDirectoryOriginPin, updateDirectoryState } from './ground-directory-state';
import type { MapPlace } from './explorer-model';
import './ground-directory.css';
import compiledModel from '../../../packages/domain/reference/ground-floor-model.json';
import prepared from '../../../packages/domain/reference/ground-floor-prepared.json';
import { updateDirectoryContent } from './directory-live-content';

export const GROUND_FLOOR_SOURCE = '/maps/ground-floor-master.svg';
export type GroundFloorStatus = { state: 'loading' | 'ready' | 'error'; message?: string };

/** The source document is the map. React owns only the host; the source tree stays intact. */
export function GroundFloor({
  onBounds,
  onStatus,
  places,
  selectedId,
  matchingIds,
  originPoint,
  onSelect,
}: {
  onBounds: (bounds: Box) => void;
  onStatus: (status: GroundFloorStatus) => void;
  places: MapPlace[];
  selectedId?: string;
  matchingIds?: string[];
  originPoint?: { x: number; y: number } | null;
  onSelect: (place: MapPlace) => void;
}) {
  const host = useRef<SVGGElement>(null);
  const live = useRef({ places, selectedId, matchingIds, originPoint, onSelect });
  live.current = { places, selectedId, matchingIds, originPoint, onSelect };
  const sourceRef = useRef<SVGSVGElement>(undefined);
  const hovered = useRef<string>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    const container = host.current!;
    let disposed = false;
    onStatus({ state: 'loading' });
    async function load() {
      try {
        const response = await fetch(prepared.url, { signal: controller.signal });
        if (!response.ok)
          throw new Error(`Ground Floor architecture could not be loaded (${response.status}).`);
        const raw = await response.text();
        const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
        if (
          doc.querySelector('parsererror') ||
          doc.documentElement.getAttribute('data-source-sha256') !== compiledModel.sourceSha256 ||
          doc.documentElement.getAttribute('data-prepared-directory') !== '2'
        )
          throw new Error('The prepared Ground Floor map is out of date. Rebuild the directory.');
        const source = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
        if (disposed) return;
        // Typography, clips, geometry metadata, decor and amenities are already prepared.
        // Wait for the essential font before the single, complete visible insertion.
        await document.fonts.load('600 16px Inter');
        if (disposed) return;
        const registry = compiledModel;
        sourceRef.current = source;
        updateDirectoryContent(source, 'l0', live.current.places);
        updateDirectoryState(source, live.current.selectedId, live.current.matchingIds);
        updateDirectoryOriginPin(source, live.current.originPoint);
        onBounds(registry.bounds);
        container.replaceChildren(source);
        container.setAttribute('data-detection-status', 'ready');
        container.setAttribute('data-detected-modules', String(registry.modules.length));
        container.setAttribute(
          'data-bound-modules',
          String(registry.modules.filter((m) => m.tenantId).length),
        );
        onStatus({ state: 'ready' });
        container.dispatchEvent(new CustomEvent('way-ezy-map-ready', { bubbles: true }));
      } catch (error) {
        if (disposed) return;
        container.setAttribute('data-detection-status', 'error');
        onStatus({
          state: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Ground Floor architecture could not be loaded.',
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
  }, [onBounds, onStatus]);
  useEffect(() => {
    if (!sourceRef.current) return;
    updateDirectoryContent(sourceRef.current, 'l0', places);
    updateDirectoryState(sourceRef.current, selectedId, matchingIds, hovered.current);
  }, [places]);
  useEffect(() => {
    if (sourceRef.current)
      updateDirectoryState(sourceRef.current, selectedId, matchingIds, hovered.current);
  }, [selectedId, matchingIds]);
  useEffect(() => {
    if (sourceRef.current) updateDirectoryOriginPin(sourceRef.current, originPoint);
  }, [originPoint === null, originPoint?.x, originPoint?.y]);
  function select(target: EventTarget) {
    const id = (target as Element).closest('[data-place-id]')?.getAttribute('data-place-id');
    const place = live.current.places.find((p) => p.id === id);
    if (place) live.current.onSelect(place);
  }
  return (
    <g
      ref={host}
      className="ground-floor-source"
      data-source={GROUND_FLOOR_SOURCE}
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
        // Hover styling is for mice; on touch it would restyle the whole plan on every tap.
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
            hovered.current,
          );
      }}
      onPointerLeave={() => {
        if (!hovered.current) return;
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
