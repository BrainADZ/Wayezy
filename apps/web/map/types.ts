import type { MutableRefObject } from 'react';
import type { Snapshot } from '../../../packages/domain';
import type { MapFocus, RoutePiece } from './model';

export type MapMode = '3d' | 'svg';
export type MapView = 'floor' | 'exploded';

export interface ZoomCommand {
  kind: 'in' | 'out' | 'reset';
  nonce: number;
}

/** Shared contract for <MapRenderer mode="3d" /> and <MapRenderer mode="svg" />. */
export interface MapViewProps {
  data: Snapshot;
  floorId: string;
  view: MapView;
  startNodeId?: string | null;
  youAreHereLabel: string;
  selectedFeatureId?: string | null;
  destinationNodeId?: string | null;
  destinationLabel?: string;
  /** When set, matching units are emphasised and all other units are softly dimmed. */
  highlightFeatureIds?: string[] | null;
  pieces?: RoutePiece[];
  progressRef?: MutableRefObject<number>;
  /** Connector node pulsing during a floor transition. */
  activeConnectorNodeIds?: string[] | null;
  focus?: MapFocus | null;
  zoomCommand?: ZoomCommand | null;
  reducedMotion?: boolean;
  compact?: boolean;
  /** Route mode keeps labels minimal and route-relevant. */
  labelMode?: 'auto' | 'route';
  onSelectFeature?: (featureId: string) => void;
  onSelectMarker?: (poiIds: string[], nodeIds: string[]) => void;
}
