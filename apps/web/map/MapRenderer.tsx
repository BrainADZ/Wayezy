import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { hasWebGL } from '../shared/hooks';
import { Glyph } from '../icons/glyphs';
import SvgMap from './SvgMap';
import type { MapMode, MapView, MapViewProps } from './types';

const ThreeMap = lazy(() => import('./ThreeMap'));

class MapErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * <MapRenderer mode="3d" /> or <MapRenderer mode="svg" />.
 * 3D is lazy-loaded and automatically falls back to SVG when WebGL is unavailable, the GPU
 * context is lost, or the 3D scene throws — the visitor never sees a broken map.
 */
export function MapRenderer({
  mode,
  ...props
}: MapViewProps & { mode: MapMode; onFallback?: () => void }) {
  const [webgl] = useState(() => hasWebGL());
  const [failed, setFailed] = useState(false);
  const effective: MapMode = mode === '3d' && webgl && !failed ? '3d' : 'svg';
  const fail = () => {
    setFailed(true);
    props.onFallback?.();
  };
  return (
    <div className="map-renderer" data-mode={effective} data-view={props.view}>
      {effective === '3d' ? (
        <MapErrorBoundary onError={fail}>
          <Suspense fallback={<div className="map-loading" aria-hidden="true" />}>
            <ThreeMap {...props} onContextLost={fail} />
          </Suspense>
        </MapErrorBoundary>
      ) : (
        <SvgMap {...props} />
      )}
    </div>
  );
}

export function FloorSwitcher({
  floors,
  floorId,
  onChange,
  routeFloorIds,
  label,
}: {
  floors: { id: string; shortName: string; theme: string; level: number }[];
  floorId: string;
  onChange: (id: string) => void;
  routeFloorIds?: string[];
  label: string;
}) {
  const ordered = [...floors].sort((a, b) => b.level - a.level);
  return (
    <div className="floor-switcher" role="radiogroup" aria-label={label}>
      {ordered.map((floor) => (
        <button
          key={floor.id}
          type="button"
          role="radio"
          aria-checked={floor.id === floorId}
          className={`${floor.id === floorId ? 'is-active' : ''} ${routeFloorIds?.includes(floor.id) ? 'is-on-route' : ''}`}
          onClick={() => onChange(floor.id)}
          title={`${floor.shortName} · ${floor.theme}`}
        >
          {floor.shortName}
          {routeFloorIds?.includes(floor.id) ? <i aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

export function MapToolbar({
  mode,
  view,
  onMode,
  onView,
  onZoom,
  labels,
}: {
  mode: MapMode;
  view: MapView;
  onMode?: (mode: MapMode) => void;
  onView?: (view: MapView) => void;
  onZoom: (kind: 'in' | 'out' | 'reset') => void;
  labels: {
    zoomIn: string;
    zoomOut: string;
    recenter: string;
    view3d: string;
    view2d: string;
    exploded: string;
    single: string;
  };
}) {
  return (
    <div className="map-toolbar">
      {onView ? (
        <button
          type="button"
          className={`map-tool is-wide ${view === 'exploded' ? 'is-active' : ''}`}
          onClick={() => onView(view === 'exploded' ? 'floor' : 'exploded')}
          aria-pressed={view === 'exploded'}
        >
          <Glyph name="explode" size={22} />
          <span>{view === 'exploded' ? labels.single : labels.exploded}</span>
        </button>
      ) : null}
      {onMode ? (
        <div className="map-segment" role="group" aria-label="Map style">
          <button
            type="button"
            className={mode === '3d' ? 'is-active' : ''}
            aria-pressed={mode === '3d'}
            onClick={() => onMode('3d')}
          >
            {labels.view3d}
          </button>
          <button
            type="button"
            className={mode === 'svg' ? 'is-active' : ''}
            aria-pressed={mode === 'svg'}
            onClick={() => onMode('svg')}
          >
            {labels.view2d}
          </button>
        </div>
      ) : null}
      <div className="map-zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          className="map-tool"
          onClick={() => onZoom('in')}
          aria-label={labels.zoomIn}
        >
          <Glyph name="plus" size={22} />
        </button>
        <button
          type="button"
          className="map-tool"
          onClick={() => onZoom('out')}
          aria-label={labels.zoomOut}
        >
          <Glyph name="minus" size={22} />
        </button>
        <button
          type="button"
          className="map-tool"
          onClick={() => onZoom('reset')}
          aria-label={labels.recenter}
        >
          <Glyph name="locate" size={22} />
        </button>
      </div>
    </div>
  );
}
