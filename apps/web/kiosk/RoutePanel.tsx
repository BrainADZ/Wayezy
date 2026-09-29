import { useEffect, useRef } from 'react';
import type { Route, RouteStep, Snapshot } from '../../../packages/domain';
import { Glyph } from '../icons/glyphs';
import { WayIcon } from '../icons/illustrated';
import { useI18n } from '../shared/i18n';
import type { RoutePiece } from '../map/model';
import type { PlaybackPhase } from '../map/useRoutePlayback';

export const stepGlyph: Record<RouteStep['kind'], string> = {
  start: 'arrowUp',
  straight: 'arrowUp',
  left: 'turnLeft',
  right: 'turnRight',
  'slight-left': 'slightLeft',
  'slight-right': 'slightRight',
  lift: 'layers',
  escalator: 'arrowUpRight',
  stairs: 'arrowUpRight',
  ramp: 'arrowUpRight',
  arrive: 'pin',
};

/** Which playback piece each instruction belongs to, so the active step follows the animation. */
export function stepPieceIndex(steps: RouteStep[], pieces: RoutePiece[]) {
  const result: number[] = [];
  let pieceCursor = 0;
  for (const step of steps) {
    if (step.connector) {
      const index = pieces.findIndex((p, i) => i >= pieceCursor && p.kind === 'vertical');
      if (index >= 0) {
        // Consecutive vertical hops merge into one instruction.
        let last = index;
        while (
          pieces[last + 1]?.kind === 'vertical' ||
          (pieces[last + 1]?.kind === 'floor' &&
            (pieces[last + 1] as { points: unknown[] }).points.length < 2 &&
            pieces[last + 2]?.kind === 'vertical')
        )
          last++;
        result.push(index);
        pieceCursor = last + 1;
        continue;
      }
    }
    const index = pieces.findIndex(
      (p, i) => i >= pieceCursor && p.kind === 'floor' && p.floorId === step.floorId,
    );
    result.push(index >= 0 ? index : Math.max(0, pieces.length - 1));
    if (index >= 0) pieceCursor = index;
  }
  return result;
}

export function RouteSummary({
  data,
  route,
  destinationName,
  destinationFloorId,
  floorId,
  onFloor,
}: {
  data: Snapshot;
  route: Route;
  destinationName: string;
  destinationFloorId: string;
  floorId: string;
  onFloor: (id: string) => void;
}) {
  const { t } = useI18n();
  const destinationFloor = data.floors.find((f) => f.id === destinationFloorId);
  return (
    <div className="route-summary">
      <div className="route-summary-title">
        <span>{t('route.to')}</span>
        <h2>{destinationName}</h2>
        <p>
          <strong>{destinationFloor?.shortName}</strong> · {destinationFloor?.theme}
        </p>
      </div>
      <div className="route-metrics">
        <div>
          <strong>{route.minutes}</strong>
          <span>min</span>
        </div>
        <div>
          <strong>{route.distance}</strong>
          <span>m</span>
        </div>
      </div>
      <div className="route-floors" aria-label="Floors on this route">
        {route.floorIds.map((id, i) => {
          const floor = data.floors.find((f) => f.id === id);
          return (
            <span key={id} className="route-floor-step">
              {i > 0 ? <Glyph name="chevronRight" size={22} /> : null}
              <button
                type="button"
                className={id === floorId ? 'is-active' : ''}
                onClick={() => onFloor(id)}
              >
                {floor?.shortName}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function TransitionBanner({
  data,
  piece,
  phase,
}: {
  data: Snapshot;
  piece: RoutePiece | null;
  phase: PlaybackPhase;
}) {
  const { t } = useI18n();
  if (phase !== 'transition' || !piece || piece.kind !== 'vertical') return null;
  const toFloor = data.floors.find((f) => f.id === piece.toFloorId);
  const fromFloor = data.floors.find((f) => f.id === piece.fromFloorId);
  const up = (toFloor?.level ?? 0) > (fromFloor?.level ?? 0);
  const noun = piece.type === 'lift' ? 'lift' : piece.type === 'escalator' ? 'escalator' : 'stairs';
  return (
    <div className="transition-banner" role="status" aria-live="assertive">
      <WayIcon
        name={piece.type === 'lift' ? 'lift' : piece.type === 'escalator' ? 'escalator' : 'stairs'}
        size={92}
      />
      <div>
        <span>{t('route.floorChange')}</span>
        <strong>
          Take the {noun}
          {piece.type === 'lift' ? '' : up ? ' up' : ' down'} to {toFloor?.name}
        </strong>
        <small>
          {fromFloor?.shortName} → {toFloor?.shortName} · {toFloor?.theme}
        </small>
      </div>
    </div>
  );
}

export function RoutePanel({
  route,
  pieces,
  pieceIndex,
  phase,
  accessible,
  onAccessible,
  onReplay,
  onSendToPhone,
  onBack,
  onStartOver,
  view,
  onView,
}: {
  route: Route;
  pieces: RoutePiece[];
  pieceIndex: number;
  phase: PlaybackPhase;
  accessible: boolean;
  onAccessible: (value: boolean) => void;
  onReplay: () => void;
  onSendToPhone: () => void;
  onBack: () => void;
  onStartOver: () => void;
  view: 'floor' | 'exploded';
  onView: (view: 'floor' | 'exploded') => void;
}) {
  const { t } = useI18n();
  const mapping = stepPieceIndex(route.steps, pieces);
  const activeStep =
    phase === 'arrived'
      ? route.steps.length - 1
      : Math.max(
          0,
          mapping.findIndex((index) => index >= pieceIndex),
        );
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const item = listRef.current?.children[activeStep] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeStep]);
  return (
    <section className="route-panel" aria-label={t('route.steps')}>
      <div className="route-panel-controls">
        <button
          type="button"
          role="switch"
          aria-checked={accessible}
          className={`route-mode ${accessible ? 'is-on' : ''}`}
          onClick={() => onAccessible(!accessible)}
        >
          <WayIcon name="accessibility" size={60} />
          <span>
            <strong>{accessible ? t('route.accessible') : t('route.standard')}</strong>
            <small>{accessible ? t('route.accessibleHint') : t('route.standardHint')}</small>
          </span>
          <i className="switch" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`btn btn-outline btn-lg ${view === 'exploded' ? 'is-pressed' : ''}`}
          onClick={() => onView(view === 'exploded' ? 'floor' : 'exploded')}
          aria-pressed={view === 'exploded'}
        >
          <WayIcon name="floor" size={44} />
          {view === 'exploded' ? t('map.singleFloor') : t('map.exploded')}
        </button>
      </div>
      {accessible ? (
        <div className="accessible-badge">
          <Glyph name="accessibility" size={24} /> {t('route.accessible')} ·{' '}
          {t('route.accessibleHint')}
        </div>
      ) : null}
      <ol className="route-steps" ref={listRef}>
        {route.steps.map((step, i) => (
          <li
            key={`${step.nodeId}-${i}`}
            className={[
              'route-step',
              i === activeStep && 'is-active',
              i < activeStep && 'is-done',
              step.connector && 'is-connector',
              step.kind === 'arrive' && 'is-arrive',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="route-step-icon">
              {step.connector ? (
                <WayIcon
                  name={
                    step.kind === 'lift'
                      ? 'lift'
                      : step.kind === 'escalator'
                        ? 'escalator'
                        : 'stairs'
                  }
                  size={44}
                />
              ) : (
                <Glyph name={stepGlyph[step.kind]} size={30} />
              )}
            </span>
            <span className="route-step-text">
              <strong>{step.text}</strong>
              {step.distance >= 1 && !step.connector ? (
                <small>{Math.round(step.distance)} m</small>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      <div className="route-actions">
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          <Glyph name="arrowLeft" size={26} /> {t('route.back')}
        </button>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onReplay}>
          <Glyph name="replay" size={26} /> {t('route.replay')}
        </button>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onStartOver}>
          <Glyph name="refresh" size={26} /> {t('route.startOver')}
        </button>
        <button type="button" className="btn btn-primary btn-xl" onClick={onSendToPhone}>
          <WayIcon name="qr" size={46} /> {t('tenant.sendToPhone')}
        </button>
      </div>
    </section>
  );
}
